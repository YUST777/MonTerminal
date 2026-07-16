import type { Address } from "viem";
import { createClients } from "./clients.ts";
import { loadConfig } from "./config.ts";
import { evaluate } from "./evaluator.ts";
import { Executor } from "./executor.ts";
import { createLogger } from "./logger.ts";
import { OrderStore } from "./orderStore.ts";
import { fetchPoolTicks } from "./priceWatcher.ts";

async function main() {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);
  const clients = createClients(config);

  log.info(
    {
      keeper: clients.account.address,
      book: config.BOOK_ADDRESS,
      pollMs: config.POLL_MS,
      dryRun: config.DRY_RUN,
    },
    "monolimit keeper starting",
  );

  const store = new OrderStore(clients.publicClient, config.BOOK_ADDRESS as Address, log);
  await store.hydrate(config.DEPLOY_BLOCK);
  store.watch(() => log.debug({ open: store.open.size }, "order set changed"));

  const executor = new Executor(clients, config, store, log);

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1); // second signal: hard exit
    stopping = true;
    log.info("shutting down (waiting for in-flight work)…");
    store.stop();
    setTimeout(() => process.exit(0), 2_000);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Main loop: one slot0 multicall per poll, pure evaluation, then execution.
  while (!stopping) {
    const startedAt = Date.now();
    try {
      const ticks = await fetchPoolTicks(clients.publicClient, store.watchedPools);
      const nowSec = Math.floor(Date.now() / 1000);

      const jobs: Promise<void>[] = [];
      for (const order of store.open.values()) {
        const tick = ticks.get(order.pool);
        const verdict = evaluate(order, tick, nowSec);
        if (verdict.action === "drop") {
          store.remove(order.orderId); // expired: silently forget (cannot execute)
        } else if (verdict.action === "execute" && tick !== undefined) {
          jobs.push(executor.tryExecute(order, tick));
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
