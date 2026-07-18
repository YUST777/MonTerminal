import { erc20Abi, parseAbi, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applySlippageBps,
  computeTrigger,
  quoteAtTick,
  ADDRESSES,
  LIMIT_ORDER_BOOK_ABI,
  monad,
} from "@monolimit/shared";
import { resolveBook } from "../config/wagmi.ts";
import { useTerminal, type PoolInfo, type TokenMeta } from "../state/terminal.ts";
import { useToasts } from "../components/Toasts.tsx";

export function useTokenBalance(token: Address | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: monad.id, // token lives on Monad even if the wallet wandered
    query: { enabled: !!token && !!address, refetchInterval: 5_000 },
  });
}

export function useAllowance(token: Address | undefined, book: Address | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && book ? [address, book] : undefined,
    chainId: monad.id,
    query: { enabled: !!token && !!address && !!book, refetchInterval: 5_000 },
  });
}

export interface OrderDraft {
  kind: "tp" | "sl";
  amountIn: bigint;
  /** price multiple vs current: 2 = 2x TP, 0.5 = −50% SL */
  multiple: number;
  maxSlippageBps?: number; // SL only
  expiry?: number; // unix secs, 0 = GTC
  keeperFeeBps?: number;
  unwrapToNative?: boolean;
}

export function buildOrderParams(
  draft: OrderDraft,
  token: TokenMeta,
  pool: PoolInfo,
  currentTick: number,
) {
  const tokenIn = token.address;
  const tokenOut = pool.quote.address;
  const isWmonOut = tokenOut.toLowerCase() === ADDRESSES.WMON.toLowerCase();
  const { triggerTick } = computeTrigger(draft.kind, currentTick, draft.multiple, tokenIn, tokenOut);

  // TP: minAmountOut IS the trigger — full quote at the trigger tick.
  // SL: the contract floors against the TWAP; minAmountOut is a static backstop
  //     at the trigger quote minus the slippage budget.
  const quote = quoteAtTick(triggerTick, draft.amountIn, tokenIn, tokenOut);
  const minAmountOut =
    draft.kind === "tp" ? quote : applySlippageBps(quote, draft.maxSlippageBps ?? 500);

  return {
    tokenIn,
    tokenOut,
    poolFee: pool.fee,
    amountIn: draft.amountIn,
    minAmountOut: minAmountOut < 1n ? 1n : minAmountOut,
    triggerTick,
    maxSlippageBps: draft.kind === "sl" ? (draft.maxSlippageBps ?? 500) : 0,
    expiry: draft.expiry ?? 0,
    keeperFeeBps: draft.keeperFeeBps ?? 30,
    kind: draft.kind === "tp" ? 0 : 1,
    // native-MON payout is only possible when the pool quotes in WMON
    unwrapToNative: isWmonOut && (draft.unwrapToNative ?? true),
  };
}

/**
 * Buy-the-dip limit: deposit the pool's quote token, receive `token` once its
 * price has dropped `dropPct`% — mechanically a take-profit in the
 * quote→token direction (the quote's price in token rises by 1/multiple).
 */
export function buildBuyLimitParams(
  draft: { amountIn: bigint; dropPct: number; expiry?: number; keeperFeeBps?: number },
  token: TokenMeta,
  pool: PoolInfo,
  currentTick: number,
) {
  if (draft.dropPct >= 0) throw new Error("buy limit trigger must be below current price");
  const tokenIn = pool.quote.address;
  const tokenOut = token.address;
  const multiple = 1 / (1 + draft.dropPct / 100); // token −30% ⇒ quote buys 1.43×
  const { triggerTick } = computeTrigger("tp", currentTick, multiple, tokenIn, tokenOut);
  const quote = quoteAtTick(triggerTick, draft.amountIn, tokenIn, tokenOut);
  return {
    tokenIn,
    tokenOut,
    poolFee: pool.fee,
    amountIn: draft.amountIn,
    minAmountOut: quote < 1n ? 1n : quote, // minOut IS the trigger
    triggerTick,
    maxSlippageBps: 0,
    expiry: draft.expiry ?? 0,
    keeperFeeBps: draft.keeperFeeBps ?? 30,
    kind: 0,
    unwrapToNative: false, // payout is the token itself
  };
}

/** Approve (if needed) then placeOrders — the two-step "ApprovalGate" flow.
 *  Orders go to the selected pool's market book (Uniswap v3 / Capricorn / …). */
export function usePlaceOrders(token: TokenMeta | null) {
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: monad.id });
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const pool = useTerminal((s) => s.pool);
  // null until the book contract is deployed — never approve/place against 0x0
  const book = resolveBook(pool?.market.book);
  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    token?.address,
    book ?? undefined,
  );

  const needsApproval = (total: bigint) => allowance === undefined || allowance < total;

  const requireBook = (): Address => {
    if (!book)
      throw new Error("Limit orders aren't live yet — the order book contract isn't deployed");
    return book;
  };

  const approve = async (amount: bigint) => {
    if (!token || amount <= 0n) return;
    const hash = await writeContractAsync({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [requireBook(), amount],
      chainId: monad.id,
    });
    await client!.waitForTransactionReceipt({ hash });
    await refetchAllowance();
    push("success", `${token.symbol} exact approval confirmed`);
  };

  const place = async (params: ReturnType<typeof buildOrderParams>[]) => {
    const hash = await writeContractAsync({
      address: requireBook(),
      abi: LIMIT_ORDER_BOOK_ABI,
      functionName: "placeOrders",
      args: [params],
      chainId: monad.id,
    });
    const receipt = await client!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("placeOrders reverted");
    push("success", `${params.length} order${params.length > 1 ? "s" : ""} placed`);
    queryClient.invalidateQueries({ queryKey: ["user-orders"] });
  };

  return { needsApproval, approve, place, isPending, allowance, bookReady: book !== null };
}

const OBSERVE_ABI = parseAbi([
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",
]);

/**
 * Whether the pool can serve the 60s TWAP a stop-loss needs — `observe([60,0])`
 * reverts on pools younger than a minute (the book would throw TwapUnavailable).
 */
export function useTwapAvailable(pool: PoolInfo | null) {
  const client = usePublicClient({ chainId: monad.id });
  return useQuery({
    queryKey: ["twap-ok", pool?.address],
    enabled: !!client && !!pool,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        await client!.readContract({
          address: pool!.address,
          abi: OBSERVE_ABI,
          functionName: "observe",
          args: [[60, 0]],
        });
        return true;
      } catch {
        return false;
      }
    },
  });
}

export function useCancelOrders() {
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: monad.id });
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  const cancel = async (ids: bigint[], book: Address) => {
    const hash = await writeContractAsync({
      address: book,
      abi: LIMIT_ORDER_BOOK_ABI,
      functionName: ids.length === 1 ? "cancelOrder" : "cancelOrders",
      args: ids.length === 1 ? [ids[0]!] : [ids],
      chainId: monad.id,
    });
    await client!.waitForTransactionReceipt({ hash });
    push("success", "Order cancelled");
    queryClient.invalidateQueries({ queryKey: ["user-orders"] });
  };

  return { cancel, isPending };
}
