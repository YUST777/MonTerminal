import { tickToExecutionPrice } from "@monolimit/shared";

/**
 * Build an order-book-style depth ladder from Uniswap-v3 tick liquidity.
 * This is the pool's REAL executable depth: each level is one tick-spacing
 * range, sized by how much TOKEN the pool trades through that range given
 * the active liquidity (adjusted by liquidityNet at each initialized tick).
 */

export interface DepthLevel {
  price: number; // TOKEN priced in quote
  size: number; // TOKEN units available in this range
  total: number; // cumulative from the spread outwards
}

export interface DepthBook {
  asks: DepthLevel[]; // ascending distance from spread (asks[0] = best ask)
  bids: DepthLevel[];
  spreadAbs: number;
  spreadPct: number;
}

export interface DepthInput {
  tick: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tickSpacing: number;
  tokenIsToken0: boolean;
  token: { address: string; decimals: number };
  quote: { address: string; decimals: number };
  levels: number;
  /** liquidityNet per initialized boundary tick (missing ⇒ 0). */
  liquidityNet: Map<number, bigint>;
}

const sqrtAtTick = (t: number) => Math.pow(1.0001, t / 2);

export function buildDepth(input: DepthInput): DepthBook {
  const { tick, tickSpacing, tokenIsToken0, token, quote, levels, liquidityNet } = input;
  const sqrtNow = Number(input.sqrtPriceX96) / 2 ** 96;
  const tickLow = Math.floor(tick / tickSpacing) * tickSpacing;
  const tokenScale = 10 ** token.decimals;

  // Size of TOKEN traded across [sqrtA, sqrtB) at active liquidity L.
  const sizeIn = (L: number, sqrtA: number, sqrtB: number) =>
    tokenIsToken0 ? (L * (1 / sqrtA - 1 / sqrtB)) / tokenScale : (L * (sqrtB - sqrtA)) / tokenScale;

  const priceAt = (t: number) =>
    tickToExecutionPrice(t, token.address, quote.address, token.decimals, quote.decimals);

  /** Walk pool-tick ranges away from the current price. up=true → tick rising. */
  const walk = (up: boolean): DepthLevel[] => {
    const out: DepthLevel[] = [];
    let L = Number(input.liquidity);
    let total = 0;
    for (let k = 0; k < levels; k++) {
      let lo: number, hi: number, sqrtA: number, sqrtB: number, edge: number;
      if (up) {
        lo = tickLow + k * tickSpacing;
        hi = lo + tickSpacing;
        sqrtA = k === 0 ? sqrtNow : sqrtAtTick(lo);
        sqrtB = sqrtAtTick(hi);
        edge = hi;
        if (k > 0) L += Number(liquidityNet.get(lo) ?? 0n); // crossed `lo` going up
      } else {
        lo = tickLow - k * tickSpacing;
        hi = lo + tickSpacing;
        sqrtA = sqrtAtTick(lo);
        sqrtB = k === 0 ? sqrtNow : sqrtAtTick(hi);
        edge = lo;
        if (k > 0) L -= Number(liquidityNet.get(hi) ?? 0n); // crossed `hi` going down
      }
      if (L <= 0 || sqrtB <= sqrtA) continue;
      const size = sizeIn(L, sqrtA, sqrtB);
      if (!Number.isFinite(size) || size <= 0) continue;
      total += size;
      out.push({ price: priceAt(edge), size, total });
    }
    return out;
  };

  // TOKEN price rises with pool tick iff token is token0.
  const asks = walk(tokenIsToken0);
  const bids = walk(!tokenIsToken0);

  const bestAsk = asks[0]?.price ?? 0;
  const bestBid = bids[0]?.price ?? 0;
  const mid = (bestAsk + bestBid) / 2;
  return {
    asks,
    bids,
    spreadAbs: bestAsk && bestBid ? bestAsk - bestBid : 0,
    spreadPct: mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0,
  };
}
