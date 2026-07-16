import { describe, expect, it } from "vitest";
import { evaluate } from "../src/evaluator.ts";
import type { StoredOrder } from "../src/orderStore.ts";

function order(overrides: Partial<StoredOrder> = {}): StoredOrder {
  return {
    orderId: 1n,
    book: "0x4000000000000000000000000000000000000004",
    maker: "0x0000000000000000000000000000000000000001",
    tokenIn: "0x1000000000000000000000000000000000000001",
    tokenOut: "0x2000000000000000000000000000000000000002",
    poolFee: 3000,
    amountIn: 10n ** 18n,
    minAmountOut: 1n,
    triggerTick: 0,
    triggerWhenTickBelow: true,
    maxSlippageBps: 500,
    expiry: 0,
    keeperFeeBps: 30,
    kind: 1,
    unwrapToNative: false,
    pool: "0x3000000000000000000000000000000000000003",
    ...overrides,
  };
}

describe("evaluate", () => {
  it("drops expired orders", () => {
    expect(evaluate(order({ expiry: 100 }), 0, 101)).toEqual({ action: "drop", reason: "expired" });
  });

  it("keeps GTC orders regardless of time", () => {
    expect(evaluate(order({ expiry: 0, triggerTick: 10 }), 0, 9_999_999_999).action).toBe("execute");
  });

  it("skips when no tick available", () => {
    expect(evaluate(order(), undefined, 0)).toEqual({ action: "skip", reason: "no-tick" });
  });

  it("below-trigger fires at and below the tick, not above", () => {
    const o = order({ triggerTick: -100, triggerWhenTickBelow: true });
    expect(evaluate(o, -100, 0).action).toBe("execute");
    expect(evaluate(o, -101, 0).action).toBe("execute");
    expect(evaluate(o, -99, 0).action).toBe("skip");
  });

  it("above-trigger fires at and above the tick, not below", () => {
    const o = order({ triggerTick: 500, triggerWhenTickBelow: false });
    expect(evaluate(o, 500, 0).action).toBe("execute");
    expect(evaluate(o, 501, 0).action).toBe("execute");
    expect(evaluate(o, 499, 0).action).toBe("skip");
  });

  it("expiry boundary is inclusive (executable exactly at expiry)", () => {
    const o = order({ expiry: 100, triggerTick: 0, triggerWhenTickBelow: true });
    expect(evaluate(o, 0, 100).action).toBe("execute");
    expect(evaluate(o, 0, 101).action).toBe("drop");
  });
});
