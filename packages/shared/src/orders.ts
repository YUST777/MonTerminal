/**
 * Tick / price math shared by web + keeper. Mirrors the on-chain semantics of
 * LimitOrderBook exactly: prices are expressed as "tokenOut per tokenIn" and
 * converted to Uniswap v3 ticks (which are always token1-per-token0).
 */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

const LN_1_0001 = Math.log(1.0001);

/** Is `tokenA` the pool's token0 (i.e. sorts below tokenB)? */
export function isToken0(tokenA: string, tokenB: string): boolean {
  return tokenA.toLowerCase() < tokenB.toLowerCase();
}

/**
 * Pool price (token1 per token0, decimal-adjusted) at a tick.
 * price = 1.0001^tick * 10^(dec0 - dec1)
 */
export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}

/** Inverse of tickToPrice (unrounded, fractional tick). */
export function priceToTickExact(price: number, dec0: number, dec1: number): number {
  return Math.log(price / Math.pow(10, dec0 - dec1)) / LN_1_0001;
}

/**
 * Price of `tokenIn` denominated in `tokenOut` at a given pool tick.
 * If tokenIn is token0 the pool tick already quotes token1/token0; otherwise invert.
 */
export function tickToExecutionPrice(
  tick: number,
  tokenIn: string,
  tokenOut: string,
  decIn: number,
  decOut: number,
): number {
  if (isToken0(tokenIn, tokenOut)) {
    return tickToPrice(tick, decIn, decOut);
  }
  return 1 / tickToPrice(tick, decOut, decIn);
}

/**
 * Tick delta for a price multiple of tokenIn (in tokenOut terms).
 * Δtick = ln(mult) / ln(1.0001), signed by pool orientation:
 * tokenIn = token0 → price up = tick up; tokenIn = token1 → price up = tick down.
 */
export function tickDeltaForMultiple(
  multiple: number,
  tokenIn: string,
  tokenOut: string,
): number {
  if (multiple <= 0) throw new Error("multiple must be > 0");
  const raw = Math.log(multiple) / LN_1_0001;
  return isToken0(tokenIn, tokenOut) ? raw : -raw;
}

export interface TriggerCalc {
  /** Pool tick at which the order becomes executable. */
  triggerTick: number;
  /** True → executable when pool tick <= triggerTick, else when tick >= triggerTick. */
  triggerWhenTickBelow: boolean;
}

/**
 * Compute the on-chain trigger for an order given the current pool tick and a
 * price multiple relative to now (e.g. 2 for a 2x take-profit, 0.5 for a −50% stop).
 *
 * kind:
 *  - "tp": fires when tokenIn appreciates to `multiple`× current price
 *  - "sl": fires when tokenIn depreciates to `multiple`× current price (multiple < 1)
 *
 * Rounding is always *conservative for the maker*: the price must move at least
 * to the requested level before the trigger is crossed.
 */
export function computeTrigger(
  kind: "tp" | "sl",
  currentTick: number,
  multiple: number,
  tokenIn: string,
  tokenOut: string,
): TriggerCalc {
  if (kind === "tp" && multiple <= 1) throw new Error("take-profit multiple must be > 1");
  if (kind === "sl" && (multiple <= 0 || multiple >= 1))
    throw new Error("stop-loss multiple must be in (0, 1)");

  const delta = tickDeltaForMultiple(multiple, tokenIn, tokenOut);
  const exact = currentTick + delta;
  // tokenIn=token0: price up = tick up → TP triggers when tick >= trigger (round up),
  // SL when tick <= trigger (round down). Inverted for tokenIn=token1.
  const priceUpIsTickUp = isToken0(tokenIn, tokenOut);
  const isUpwardTrigger = kind === "tp" ? priceUpIsTickUp : !priceUpIsTickUp;

  const triggerTick = isUpwardTrigger ? Math.ceil(exact) : Math.floor(exact);
  if (triggerTick < MIN_TICK || triggerTick > MAX_TICK)
    throw new Error("trigger tick out of range");

  return { triggerTick, triggerWhenTickBelow: !isUpwardTrigger };
}

/**
 * Expected output of `amountIn` at `tick`, in tokenOut base units (bigint, floor).
 * Used to derive minAmountOut for take-profit orders. Computed in floating point
 * then floored — callers apply their own safety margin (slippage bps).
 */
export function quoteAtTick(
  tick: number,
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
): bigint {
  // Work in raw base units: rawPrice = 1.0001^tick is token1raw per token0raw.
  const raw = Math.pow(1.0001, tick);
  const price = isToken0(tokenIn, tokenOut) ? raw : 1 / raw;
  // Split bigint → float carefully to keep precision for large amounts.
  const scaled = Number(amountIn) * price;
  if (!Number.isFinite(scaled)) throw new Error("quote overflow");
  return BigInt(Math.floor(scaled));
}

/** Apply a bps haircut: amount × (10000 − bps) / 10000. */
export function applySlippageBps(amount: bigint, bps: number): bigint {
  if (bps < 0 || bps > 10_000) throw new Error("bps out of range");
  return (amount * BigInt(10_000 - bps)) / 10_000n;
}

/** Human-readable distance from current tick to trigger, as a % price move. */
export function distanceToTriggerPct(
  currentTick: number,
  triggerTick: number,
  tokenIn: string,
  tokenOut: string,
): number {
  const sign = isToken0(tokenIn, tokenOut) ? 1 : -1;
  return (Math.pow(1.0001, sign * (triggerTick - currentTick)) - 1) * 100;
}
