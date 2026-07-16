import { describe, expect, it } from "vitest";
import {
  applySlippageBps,
  computeTrigger,
  distanceToTriggerPct,
  isToken0,
  quoteAtTick,
  tickDeltaForMultiple,
  tickToExecutionPrice,
  tickToPrice,
} from "../src/orders";

const A = "0x1000000000000000000000000000000000000001"; // token0 (sorts first)
const B = "0x2000000000000000000000000000000000000002"; // token1

describe("isToken0", () => {
  it("sorts by lowercase hex", () => {
    expect(isToken0(A, B)).toBe(true);
    expect(isToken0(B, A)).toBe(false);
    expect(isToken0(A.toUpperCase().replace("0X", "0x"), B)).toBe(true);
  });
});

describe("tickToPrice", () => {
  it("tick 0 with equal decimals is 1", () => {
    expect(tickToPrice(0, 18, 18)).toBeCloseTo(1);
  });
  it("adjusts for decimals", () => {
    // USDC(6)/WETH(18)-style: 10^(6-18)
    expect(tickToPrice(0, 6, 18)).toBeCloseTo(1e-12);
  });
  it("one tick ≈ 1bp", () => {
    expect(tickToPrice(1, 18, 18)).toBeCloseTo(1.0001);
  });
});

describe("tickDeltaForMultiple", () => {
  it("2x is ~6931 ticks for token0 in", () => {
    expect(tickDeltaForMultiple(2, A, B)).toBeCloseTo(6931.6, 0);
  });
  it("sign flips when tokenIn is token1", () => {
    expect(tickDeltaForMultiple(2, B, A)).toBeCloseTo(-6931.6, 0);
  });
  it("0.5x is negative for token0 in", () => {
    expect(tickDeltaForMultiple(0.5, A, B)).toBeCloseTo(-6931.6, 0);
  });
});

describe("computeTrigger", () => {
  it("TP for token0-in triggers above, rounded up", () => {
    const t = computeTrigger("tp", 1000, 2, A, B);
    expect(t.triggerWhenTickBelow).toBe(false);
    expect(t.triggerTick).toBe(1000 + Math.ceil(Math.log(2) / Math.log(1.0001)));
  });
  it("SL for token0-in triggers below, rounded down", () => {
    const t = computeTrigger("sl", 1000, 0.5, A, B);
    expect(t.triggerWhenTickBelow).toBe(true);
    expect(t.triggerTick).toBe(1000 + Math.floor(-Math.log(2) / Math.log(1.0001)));
  });
  it("TP for token1-in triggers below (price up = tick down)", () => {
    const t = computeTrigger("tp", 1000, 2, B, A);
    expect(t.triggerWhenTickBelow).toBe(true);
    expect(t.triggerTick).toBeLessThan(1000);
  });
  it("SL for token1-in triggers above", () => {
    const t = computeTrigger("sl", 1000, 0.5, B, A);
    expect(t.triggerWhenTickBelow).toBe(false);
    expect(t.triggerTick).toBeGreaterThan(1000);
  });
  it("rejects invalid multiples", () => {
    expect(() => computeTrigger("tp", 0, 0.9, A, B)).toThrow();
    expect(() => computeTrigger("sl", 0, 1.5, A, B)).toThrow();
  });
});

describe("quoteAtTick", () => {
  it("tick 0 quotes 1:1 in raw units", () => {
    expect(quoteAtTick(0, 10n ** 18n, A, B)).toBe(10n ** 18n);
  });
  it("inverts for token1 in", () => {
    const up = quoteAtTick(6932, 10n ** 18n, A, B); // ~2x
    const down = quoteAtTick(6932, 10n ** 18n, B, A); // ~0.5x
    expect(Number(up) / 1e18).toBeCloseTo(2, 2);
    expect(Number(down) / 1e18).toBeCloseTo(0.5, 2);
  });
});

describe("applySlippageBps", () => {
  it("applies haircut with floor", () => {
    expect(applySlippageBps(10_000n, 50)).toBe(9950n);
    expect(applySlippageBps(3n, 1)).toBe(2n);
  });
  it("rejects out-of-range bps", () => {
    expect(() => applySlippageBps(1n, -1)).toThrow();
    expect(() => applySlippageBps(1n, 10_001)).toThrow();
  });
});

describe("round-trips", () => {
  it("computeTrigger tick maps back to ≥ requested multiple (TP, token0)", () => {
    const start = 12345;
    const { triggerTick } = computeTrigger("tp", start, 3, A, B);
    const p0 = tickToExecutionPrice(start, A, B, 18, 18);
    const p1 = tickToExecutionPrice(triggerTick, A, B, 18, 18);
    expect(p1 / p0).toBeGreaterThanOrEqual(3);
  });
  it("distanceToTriggerPct sign matches direction", () => {
    const tp = computeTrigger("tp", 0, 2, A, B);
    expect(distanceToTriggerPct(0, tp.triggerTick, A, B)).toBeGreaterThan(99);
    const sl = computeTrigger("sl", 0, 0.5, A, B);
    expect(distanceToTriggerPct(0, sl.triggerTick, A, B)).toBeLessThan(-49);
  });
});
