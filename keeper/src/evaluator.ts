import type { StoredOrder } from "./orderStore.ts";

export type Verdict =
  | { action: "execute" }
  | { action: "skip"; reason: "trigger-not-met" | "no-tick" }
  | { action: "drop"; reason: "expired" };

/**
 * Pure pre-filter deciding whether an order is worth simulating on-chain.
 * The spot tick vs trigger comparison mirrors the contract for stop-losses
 * (which additionally verify a 60s TWAP on-chain) and is a cheap proxy for
 * take-profits (whose real trigger is the swap's minAmountOut — the contract
 * simulation in the executor is the source of truth).
 */
export function evaluate(order: StoredOrder, spotTick: number | undefined, nowSec: number): Verdict {
  if (order.expiry !== 0 && nowSec > order.expiry) return { action: "drop", reason: "expired" };
  if (spotTick === undefined) return { action: "skip", reason: "no-tick" };

  const met = order.triggerWhenTickBelow
    ? spotTick <= order.triggerTick
    : spotTick >= order.triggerTick;
  return met ? { action: "execute" } : { action: "skip", reason: "trigger-not-met" };
}
