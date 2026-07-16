import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { LIMIT_ORDER_BOOK_ABI } from "@monolimit/shared";
import { BOOK_ADDRESS, DEPLOY_BLOCK } from "../config/wagmi.ts";

export const KIND = { TakeProfit: 0, StopLoss: 1 } as const;
export const STATUS = { Nonexistent: 0, Open: 1, Executed: 2, Cancelled: 3 } as const;

export interface UserOrder {
  orderId: bigint;
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

/**
 * The connected maker's full order history: OrderPlaced logs filtered by maker
 * + one getOrders multicall for live status. Events are the contract's only
 * data feed — no indexer.
 */
export function useUserOrders() {
  const { address } = useAccount();
  const client = usePublicClient();

  return useQuery({
    queryKey: ["user-orders", address],
    enabled: !!client && !!address && BOOK_ADDRESS !== "0x0000000000000000000000000000000000000000",
    refetchInterval: 5_000,
    queryFn: async (): Promise<UserOrder[]> => {
      const placed = await client!.getContractEvents({
        address: BOOK_ADDRESS,
        abi: LIMIT_ORDER_BOOK_ABI,
        eventName: "OrderPlaced",
        args: { maker: address },
        fromBlock: DEPLOY_BLOCK,
        strict: true,
      });
      if (placed.length === 0) return [];

      const ids = placed.map((l) => l.args.orderId);
      const [orders, executed] = await Promise.all([
        client!.readContract({
          address: BOOK_ADDRESS,
          abi: LIMIT_ORDER_BOOK_ABI,
          functionName: "getOrders",
          args: [ids],
        }),
        client!.getContractEvents({
          address: BOOK_ADDRESS,
          abi: LIMIT_ORDER_BOOK_ABI,
          eventName: "OrderExecuted",
          args: { maker: address },
          fromBlock: DEPLOY_BLOCK,
          strict: true,
        }),
      ]);

      const execByOrder = new Map(executed.map((l) => [l.args.orderId, l]));
      return placed
        .map((log, i): UserOrder => {
          const o = orders[i]!;
          const exec = execByOrder.get(log.args.orderId);
          return {
            orderId: log.args.orderId,
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
        })
        .sort((a, b) => (b.orderId > a.orderId ? 1 : -1));
    },
  });
}
