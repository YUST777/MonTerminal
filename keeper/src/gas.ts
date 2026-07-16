import type { PublicClient } from "viem";
import { ADDRESSES, quoteAtTick } from "@monolimit/shared";
import type { StoredOrder } from "./orderStore.ts";

const PROFIT_MARGIN = 1.5;

/**
 * Profitability gate: only execute when the keeper fee is worth ≥ gas × 1.5.
 *
 * The fee is denominated in tokenOut; gas in MON. When tokenOut is WMON the
 * comparison is exact. Otherwise we convert the fee to WMON terms through the
 * order's own pool tick when tokenIn is WMON (fee_tokenOut ≈ fee / price), and
 * when neither side is WMON we pass the gate — the on-chain simulation already
 * guaranteed the tx succeeds, and mispricing only costs dust gas on Monad.
 */
export function isProfitable(
  order: StoredOrder,
  spotTick: number,
  expectedAmountOut: bigint,
  gasEstimate: bigint,
  gasPriceWei: bigint,
): boolean {
  const feeInTokenOut = (expectedAmountOut * BigInt(order.keeperFeeBps)) / 10_000n;
  const gasCostWei = gasEstimate * gasPriceWei;
  const threshold = (gasCostWei * BigInt(Math.round(PROFIT_MARGIN * 100))) / 100n;

  const wmon = ADDRESSES.WMON.toLowerCase();
  let feeInWmon: bigint;
  if (order.tokenOut.toLowerCase() === wmon) {
    feeInWmon = feeInTokenOut;
  } else if (order.tokenIn.toLowerCase() === wmon) {
    // Convert tokenOut→WMON through the same pool's spot tick.
    feeInWmon = quoteAtTick(spotTick, feeInTokenOut, order.tokenOut, order.tokenIn);
  } else {
    return true; // no WMON leg to price against — rely on simulation + cheap gas
  }
  return feeInWmon >= threshold;
}

export async function currentGasPrice(client: PublicClient): Promise<bigint> {
  return client.getGasPrice();
}
