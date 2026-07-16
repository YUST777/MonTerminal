import { erc20Abi, maxUint256, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  applySlippageBps,
  computeTrigger,
  quoteAtTick,
  ADDRESSES,
  LIMIT_ORDER_BOOK_ABI,
} from "@monolimit/shared";
import { BOOK_ADDRESS } from "../config/wagmi.ts";
import type { PoolInfo, TokenMeta } from "../state/terminal.ts";
import { useToasts } from "../components/Toasts.tsx";

export function useTokenBalance(token: Address | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!token && !!address, refetchInterval: 5_000 },
  });
}

export function useAllowance(token: Address | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, BOOK_ADDRESS] : undefined,
    query: { enabled: !!token && !!address, refetchInterval: 5_000 },
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
  const tokenOut = ADDRESSES.WMON;
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
    unwrapToNative: draft.unwrapToNative ?? true,
  };
}

/** Approve (if needed) then placeOrders — the two-step "ApprovalGate" flow. */
export function usePlaceOrders(token: TokenMeta | null) {
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data: allowance, refetch: refetchAllowance } = useAllowance(token?.address);

  const needsApproval = (total: bigint) => allowance === undefined || allowance < total;

  const approve = async () => {
    if (!token) return;
    const hash = await writeContractAsync({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [BOOK_ADDRESS, maxUint256],
    });
    await client!.waitForTransactionReceipt({ hash });
    await refetchAllowance();
    push("success", `${token.symbol} approved`);
  };

  const place = async (params: ReturnType<typeof buildOrderParams>[]) => {
    const hash = await writeContractAsync({
      address: BOOK_ADDRESS,
      abi: LIMIT_ORDER_BOOK_ABI,
      functionName: "placeOrders",
      args: [params],
    });
    const receipt = await client!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("placeOrders reverted");
    push("success", `${params.length} order${params.length > 1 ? "s" : ""} placed`);
    queryClient.invalidateQueries({ queryKey: ["user-orders"] });
  };

  return { needsApproval, approve, place, isPending, allowance };
}

export function useCancelOrders() {
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  const cancel = async (ids: bigint[]) => {
    const hash = await writeContractAsync({
      address: BOOK_ADDRESS,
      abi: LIMIT_ORDER_BOOK_ABI,
      functionName: ids.length === 1 ? "cancelOrder" : "cancelOrders",
      args: ids.length === 1 ? [ids[0]!] : [ids],
    });
    await client!.waitForTransactionReceipt({ hash });
    push("success", "Order cancelled");
    queryClient.invalidateQueries({ queryKey: ["user-orders"] });
  };

  return { cancel, isPending };
}
