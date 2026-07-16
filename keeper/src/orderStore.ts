import type { Address, PublicClient } from "viem";
import { parseAbi } from "viem";
import { ADDRESSES, LIMIT_ORDER_BOOK_ABI } from "@monolimit/shared";
import type { Logger } from "./logger.ts";

export const OrderKind = { TakeProfit: 0, StopLoss: 1 } as const;
export const OrderStatus = { Nonexistent: 0, Open: 1, Executed: 2, Cancelled: 3 } as const;

export interface StoredOrder {
  orderId: bigint;
  maker: Address;
  tokenIn: Address;
  tokenOut: Address;
  poolFee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  triggerTick: number;
  triggerWhenTickBelow: boolean;
  maxSlippageBps: number;
  expiry: number; // unix seconds, 0 = GTC
  keeperFeeBps: number;
  kind: number;
  unwrapToNative: boolean;
  pool: Address;
}

const FACTORY_ABI = parseAbi([
  "function getPool(address, address, uint24) view returns (address)",
]);

const LOG_PAGE = 5_000n;

/**
 * In-memory open-order set, hydrated from OrderPlaced/Executed/Cancelled logs
 * (the contract's sole data feed — no separate indexer) and kept fresh with an
 * event watcher.
 */
export class OrderStore {
  readonly open = new Map<bigint, StoredOrder>();
  private poolCache = new Map<string, Address>();
  private unwatchers: (() => void)[] = [];

  constructor(
    private client: PublicClient,
    private book: Address,
    private log: Logger,
  ) {}

  /** Pools referenced by at least one open order (for the price watcher). */
  get watchedPools(): Address[] {
    return [...new Set([...this.open.values()].map((o) => o.pool))];
  }

  async hydrate(fromBlock: bigint): Promise<void> {
    const latest = await this.client.getBlockNumber();
    for (let start = fromBlock; start <= latest; start += LOG_PAGE) {
      const end = start + LOG_PAGE - 1n > latest ? latest : start + LOG_PAGE - 1n;
      const logs = await this.client.getContractEvents({
        address: this.book,
        abi: LIMIT_ORDER_BOOK_ABI,
        fromBlock: start,
        toBlock: end,
      });
      for (const log of logs) await this.apply(log.eventName, log.args as never);
    }
    this.log.info({ openOrders: this.open.size, upToBlock: latest.toString() }, "order store hydrated");
  }

  watch(onChange: () => void): void {
    this.unwatchers.push(
      this.client.watchContractEvent({
        address: this.book,
        abi: LIMIT_ORDER_BOOK_ABI,
        onLogs: async (logs) => {
          for (const log of logs) await this.apply(log.eventName, log.args as never);
          onChange();
        },
        onError: (err) => this.log.warn({ err: err.message }, "event watcher error"),
      }),
    );
  }

  stop(): void {
    for (const unwatch of this.unwatchers) unwatch();
    this.unwatchers = [];
  }

  /** Drop an order locally (e.g. keeper observed it executed elsewhere). */
  remove(orderId: bigint): void {
    this.open.delete(orderId);
  }

  private async apply(
    eventName: string,
    args: Record<string, unknown> & { orderId: bigint },
  ): Promise<void> {
    if (eventName === "OrderPlaced") {
      const pool = await this.getPool(
        args.tokenIn as Address,
        args.tokenOut as Address,
        Number(args.poolFee),
      );
      this.open.set(args.orderId, {
        orderId: args.orderId,
        maker: args.maker as Address,
        tokenIn: args.tokenIn as Address,
        tokenOut: args.tokenOut as Address,
        poolFee: Number(args.poolFee),
        amountIn: args.amountIn as bigint,
        minAmountOut: args.minAmountOut as bigint,
        triggerTick: Number(args.triggerTick),
        triggerWhenTickBelow: args.triggerWhenTickBelow as boolean,
        maxSlippageBps: Number(args.maxSlippageBps),
        expiry: Number(args.expiry),
        keeperFeeBps: Number(args.keeperFeeBps),
        kind: Number(args.kind),
        unwrapToNative: args.unwrapToNative as boolean,
        pool,
      });
      this.log.info({ orderId: args.orderId.toString() }, "order placed");
    } else if (eventName === "OrderExecuted" || eventName === "OrderCancelled") {
      if (this.open.delete(args.orderId)) {
        this.log.info({ orderId: args.orderId.toString(), eventName }, "order closed");
      }
    }
  }

  private async getPool(tokenIn: Address, tokenOut: Address, fee: number): Promise<Address> {
    const key = `${tokenIn.toLowerCase()}:${tokenOut.toLowerCase()}:${fee}`;
    let pool = this.poolCache.get(key);
    if (!pool) {
      pool = await this.client.readContract({
        address: ADDRESSES.UNISWAP_V3_FACTORY,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [tokenIn, tokenOut, fee],
      });
      this.poolCache.set(key, pool);
    }
    return pool;
  }
}
