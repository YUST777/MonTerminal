import { MARKETS } from "@monolimit/shared";
import { createClients } from "./clients.ts";
import { loadConfig } from "./config.ts";
import { evaluate } from "./evaluator.ts";
import { Executor } from "./executor.ts";
import { createLogger } from "./logger.ts";
import { NonceQueue } from "./nonce.ts";
import { OrderStore } from "./orderStore.ts";
import { fetchPoolTicks } from "./priceWatcher.ts";

async function main() {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);
  const clients = createClients(config);

  log.info(
    {
      keeper: clients.account.address,
      books: MARKETS.map((m) => `${m.label}:${m.book}`),
      pollMs: config.POLL_MS,
      dryRun: config.DRY_RUN,
    },
    "monolimit keeper starting",
  );

  // One store + executor per market's book; the wallet (and its nonce queue)
  // is shared across all of them.
  const nonceQueue = new NonceQueue();
  const lanes = MARKETS.map((market) => {
    const store = new OrderStore(clients.publicClient, market, log);
    const executor = new Executor(clients, config, store, log, nonceQueue);
    return { market, store, executor };
  });
  await Promise.all(lanes.map(({ store }) => store.hydrate()));
  for (const { market, store } of lanes) {
    store.watch(() => log.debug({ market: market.label, open: store.open.size }, "order set changed"));
  }

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1); // second signal: hard exit
    stopping = true;
    log.info("shutting down (waiting for in-flight work)…");
    for (const { store } of lanes) store.stop();
    setTimeout(() => process.exit(0), 2_000);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Main loop: one slot0 multicall per poll across every market's watched
  // pools, pure evaluation, then execution.
  while (!stopping) {
    const startedAt = Date.now();
    try {
      const pools = [...new Set(lanes.flatMap(({ store }) => store.watchedPools))];
      const ticks = await fetchPoolTicks(clients.publicClient, pools);
      const nowSec = Math.floor(Date.now() / 1000);

      const jobs: Promise<void>[] = [];
      for (const { store, executor } of lanes) {
        for (const order of store.open.values()) {
          const tick = ticks.get(order.pool);
          const verdict = evaluate(order, tick, nowSec);
          if (verdict.action === "drop") {
            store.remove(order.orderId); // expired: silently forget (cannot execute)
          } else if (verdict.action === "execute" && tick !== undefined) {
            jobs.push(executor.tryExecute(order, tick));
          }
        }
      }
      await Promise.all(jobs);
    } catch (err) {
      log.warn({ err: (err as Error).message }, "poll iteration failed");
    }
    const elapsed = Date.now() - startedAt;
    await new Promise((r) => setTimeout(r, Math.max(0, config.POLL_MS - elapsed)));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
