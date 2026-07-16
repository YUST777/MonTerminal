import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { createPublicClient, fallback, http, type Address } from "viem";
import { LIMIT_ORDER_BOOK_ABI, MARKETS, monad, type Market } from "@monolimit/shared";

export const KIND = { TakeProfit: 0, StopLoss: 1 } as const;
export const STATUS = { Nonexistent: 0, Open: 1, Executed: 2, Cancelled: 3 } as const;

export interface UserOrder {
  orderId: bigint;
  /** which book (market) this order lives in — ids are only unique per book */
  book: Address;
  marketLabel: string;
  tokenIn: Address;
  tokenOut: Address;
  poolFee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  triggerTick: number;
  triggerWhenTickBelow: boolean;
  maxSlippageBps: number;
  expiry: number;
  keeperFeeBps: number;
  kind: number;
  unwrapToNative: boolean;
  status: number;
  /** tx hashes for explorer links */
  placedTx?: `0x${string}`;
  closedTx?: `0x${string}`;
  amountOut?: bigint;
  keeperFee?: bigint;
}

/** Unique React key / dedupe handle — order ids repeat across books. */
export function orderKey(o: Pick<UserOrder, "book" | "orderId">) {
  return `${o.book}:${o.orderId}`;
}

/**
 * The connected maker's full order history across every market's book:
 * OrderPlaced logs filtered by maker + one getOrders multicall per book for
 * live status. Events are the contracts' only data feed — no indexer.
 *
 * rpc.monad.xyz hard-caps eth_getLogs at a 100-block range (413 / -32614),
 * so event queries go through a dedicated client on rpc1, which serves
 * 500k-block ranges. Results are cached per maker+book: each refetch only
 * scans blocks that arrived since the last one.
 */
const LOG_PAGE = 50_000n;

export const logClient = createPublicClient({
  chain: monad,
  transport: fallback([
    http("https://rpc1.monad.xyz", { retryCount: 3, retryDelay: 800 }),
    http("https://rpc2.monad.xyz", { retryCount: 1 }),
  ]),
});

interface LogCache {
  nextBlock: bigint;
  placed: PlacedLog[];
  executed: ExecutedLog[];
}
type PlacedLog = { args: { orderId: bigint }; transactionHash: `0x${string}` | null };
type ExecutedLog = {
  args: { orderId: bigint; amountOut?: bigint; keeperFee?: bigint };
  transactionHash: `0x${string}` | null;
};
const logCaches = new Map<string, LogCache>();

export function useUserOrders() {
  const { address } = useAccount();
  const client = usePublicClient();

  return useQuery({
    queryKey: ["user-orders", address],
    enabled: !!client && !!address,
    refetchInterval: 5_000,
    queryFn: async (): Promise<UserOrder[]> => {
      const latest = await client!.getBlockNumber();
      const perBook = await Promise.all(MARKETS.map((m) => fetchBookOrders(m, latest)));
      return perBook.flat().sort((a, b) => (b.orderId > a.orderId ? 1 : -1));
    },
  });

  /** Paged event fetch for one maker+book, appended onto the running cache. */
  async function syncLogs(market: Market, latest: bigint): Promise<LogCache> {
    const key = `${address}:${market.book}`;
    const cache = logCaches.get(key) ?? {
      nextBlock: market.deployBlock,
      placed: [],
      executed: [],
    };
    for (let start = cache.nextBlock; start <= latest; start += LOG_PAGE) {
      const end = start + LOG_PAGE - 1n > latest ? latest : start + LOG_PAGE - 1n;
      try {
        const [placed, executed] = await Promise.all([
          logClient.getContractEvents({
            address: market.book,
            abi: LIMIT_ORDER_BOOK_ABI,
            eventName: "OrderPlaced",
            args: { maker: address },
            fromBlock: start,
            toBlock: end,
            strict: true,
          }),
          logClient.getContractEvents({
            address: market.book,
            abi: LIMIT_ORDER_BOOK_ABI,
            eventName: "OrderExecuted",
            args: { maker: address },
            fromBlock: start,
            toBlock: end,
            strict: true,
          }),
        ]);
        cache.placed.push(...(placed as unknown as PlacedLog[]));
        cache.executed.push(...(executed as unknown as ExecutedLog[]));
        cache.nextBlock = end + 1n;
        logCaches.set(key, cache);
      } catch {
        // RPC hiccup — keep what we have; the next refetch resumes from
        // cache.nextBlock instead of hammering retries.
        break;
      }
    }
    return cache;
  }

  async function fetchBookOrders(market: Market, latest: bigint): Promise<UserOrder[]> {
    const { placed, executed } = await syncLogs(market, latest);
    if (placed.length === 0) return [];

    const ids = placed.map((l) => l.args.orderId);
    const orders = await client!.readContract({
      address: market.book,
      abi: LIMIT_ORDER_BOOK_ABI,
      functionName: "getOrders",
      args: [ids],
    });

    const execByOrder = new Map(executed.map((l) => [l.args.orderId, l]));
    return placed.map((log, i): UserOrder => {
      const o = orders[i]!;
      const exec = execByOrder.get(log.args.orderId);
      return {
        orderId: log.args.orderId,
        book: market.book,
        marketLabel: market.label,
        tokenIn: o.tokenIn,
        tokenOut: o.tokenOut,
        poolFee: o.poolFee,
        amountIn: o.amountIn,
        minAmountOut: o.minAmountOut,
        triggerTick: o.triggerTick,
        triggerWhenTickBelow: o.triggerWhenTickBelow,
        maxSlippageBps: o.maxSlippageBps,
        expiry: o.expiry,
        keeperFeeBps: o.keeperFeeBps,
        kind: o.kind,
        unwrapToNative: o.unwrapToNative,
        status: o.status,
        placedTx: log.transactionHash ?? undefined,
        closedTx: (exec?.transactionHash as `0x${string}` | null) ?? undefined,
        amountOut: exec?.args.amountOut,
        keeperFee: exec?.args.keeperFee,
      };
    });
  }
}
