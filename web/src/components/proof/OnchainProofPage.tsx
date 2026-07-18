import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { LIMIT_ORDER_BOOK_ABI, MARKETS, monad, type Market } from "@monolimit/shared";
import { decodeEventLog, type Hash, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { shortAddr } from "../../lib/format.ts";

interface BookProof {
  market: Market;
  deployed: boolean;
  nextOrderId: bigint | null;
  latestEvent: {
    name: "OrderPlaced" | "OrderCancelled" | "OrderExecuted";
    transactionHash: Hash;
    blockNumber: bigint;
  } | null;
}

interface ProofSnapshot {
  chainId: number;
  blockNumber: bigint;
  checkedAt: number;
  books: BookProof[];
}

const EVENT_NAMES = new Set(["OrderPlaced", "OrderCancelled", "OrderExecuted"]);

async function latestBookEvent(
  client: PublicClient,
  market: Market,
  currentBlock: bigint,
): Promise<BookProof["latestEvent"]> {
  const page = 9_999n;
  let toBlock = currentBlock;
  for (let attempt = 0; attempt < 10 && toBlock >= market.deployBlock; attempt += 1) {
    const fromBlock = toBlock > page ? toBlock - page : 0n;
    const logs = await client
      .getLogs({
        address: market.book,
        fromBlock: fromBlock < market.deployBlock ? market.deployBlock : fromBlock,
        toBlock,
      })
      .catch(() => []);
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const log = logs[index]!;
      try {
        const decoded = decodeEventLog({
          abi: LIMIT_ORDER_BOOK_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (
          EVENT_NAMES.has(decoded.eventName) &&
          log.transactionHash &&
          log.blockNumber != null
        ) {
          return {
            name: decoded.eventName as "OrderPlaced" | "OrderCancelled" | "OrderExecuted",
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
          };
        }
      } catch {
        // Ignore constructor/unknown logs and continue searching backwards.
      }
    }
    if (fromBlock <= market.deployBlock) break;
    toBlock = fromBlock - 1n;
  }
  return null;
}

async function readProof(client: PublicClient): Promise<ProofSnapshot> {
  const [chainId, blockNumber, codes, counters] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    Promise.all(MARKETS.map((market) => client.getCode({ address: market.book }))),
    client.multicall({
      contracts: MARKETS.map((market) => ({
        address: market.book,
        abi: LIMIT_ORDER_BOOK_ABI,
        functionName: "nextOrderId" as const,
      })),
      allowFailure: true,
    }),
  ]);

  const books = await Promise.all(
    MARKETS.map(async (market, index): Promise<BookProof> => {
      const result = counters[index]!;
      const nextOrderId = result.status === "success" ? result.result : null;
      return {
        market,
        deployed: Boolean(codes[index] && codes[index] !== "0x"),
        nextOrderId,
        latestEvent:
          nextOrderId != null && nextOrderId > 1n
            ? await latestBookEvent(client, market, blockNumber)
            : null,
      };
    }),
  );

  return { chainId, blockNumber, checkedAt: Date.now(), books };
}

export function OnchainProofPage() {
  const client = usePublicClient({ chainId: monad.id });
  const proof = useQuery({
    queryKey: ["onchain-proof"],
    enabled: Boolean(client),
    queryFn: () => readProof(client!),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
  const books: BookProof[] =
    proof.data?.books ??
    MARKETS.map((market) => ({
      market,
      deployed: false,
      nextOrderId: null,
      latestEvent: null,
    }));

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 rounded-xl border border-brand/30 bg-brand/5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
          <div>
            <div className="flex size-11 items-center justify-center rounded-full bg-brand/15 text-brand">
              <ShieldCheck className="size-5" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Onchain Proof</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Every value below is read live from Monad Mainnet through MonTerminal&apos;s RPC gateway.
              No order count, deployment state, block, or transaction is mocked.
            </p>
          </div>
          <button
            onClick={() => void proof.refetch()}
            disabled={proof.isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-xs font-semibold hover:border-brand disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${proof.isFetching ? "animate-spin" : ""}`} />
            Refresh chain data
          </button>
        </div>

        {proof.error && (
          <div className="mt-4 rounded-xl border border-down/30 bg-down/5 p-4 text-sm text-down">
            Live proof could not be read: {(proof.error as Error).message}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ProofStat label="Network" value="Monad Mainnet" />
          <ProofStat label="Chain ID" value={proof.data ? String(proof.data.chainId) : "Reading…"} />
          <ProofStat
            label="Current block"
            value={proof.data ? proof.data.blockNumber.toLocaleString() : "Reading…"}
          />
        </div>

        <div className="mt-4 space-y-3">
          {books.map((entry) => {
            const book = proof.data ? entry : null;
            const successfulOrders =
              book?.nextOrderId == null ? null : book.nextOrderId > 0n ? book.nextOrderId - 1n : 0n;
            return (
              <section key={entry.market.dexId} className="rounded-xl border border-line bg-raised/40 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{entry.market.label} LimitOrderBook</h2>
                      {book && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${book.deployed ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>
                          {book.deployed ? "Bytecode live" : "Not deployed"}
                        </span>
                      )}
                    </div>
                    <code className="mt-1 block break-all text-xs text-muted">{entry.market.book}</code>
                  </div>
                  <a
                    href={`https://monadscan.com/address/${entry.market.book}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                  >
                    Verify contract <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <ProofStat label="Deploy block" value={entry.market.deployBlock.toLocaleString()} compact />
                  <ProofStat
                    label="Successful orders placed"
                    value={successfulOrders == null ? "Reading…" : successfulOrders.toLocaleString()}
                    compact
                  />
                  <ProofStat
                    label="nextOrderId()"
                    value={book?.nextOrderId == null ? "Reading…" : book.nextOrderId.toLocaleString()}
                    compact
                  />
                </div>
                <div className="mt-3 rounded-lg border border-line bg-bg p-3 text-xs">
                  {book?.latestEvent ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Latest recent event: <strong>{book.latestEvent.name}</strong> at block {book.latestEvent.blockNumber.toLocaleString()}
                      </span>
                      <a
                        href={`https://monadscan.com/tx/${book.latestEvent.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        {shortAddr(book.latestEvent.transactionHash)} <ExternalLink className="size-3" />
                      </a>
                    </div>
                  ) : successfulOrders === 0n ? (
                    <span className="text-muted">No successful order transaction has been recorded on this deployment yet.</span>
                  ) : (
                    <span className="text-muted">No order event found in the most recent 100,000 blocks.</span>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-4 rounded-xl border border-warn/30 bg-warn/5 p-4 text-xs leading-relaxed text-muted sm:p-5">
          <div className="font-semibold text-fg">Execution status</div>
          <p className="mt-1">
            Contract execution is permissionless. A continuously running production keeper is not claimed as online here
            until a public heartbeat is deployed and verified. Anyone may call <code>executeOrder</code> when a trigger is met.
          </p>
        </section>
        <div className="mt-3 text-center text-[10px] text-muted">
          {proof.data ? `Last RPC read ${new Date(proof.data.checkedAt).toLocaleTimeString()}` : "Connecting to Monad RPC…"}
        </div>
      </div>
    </div>
  );
}

function ProofStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-line bg-bg ${compact ? "p-3" : "p-4"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`${compact ? "mt-1 text-sm" : "mt-2 text-lg"} font-semibold tabular-nums`}>{value}</div>
    </div>
  );
}
