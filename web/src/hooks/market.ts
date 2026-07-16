import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { ADDRESSES, FEE_TIERS, MARKETS, tickToExecutionPrice, type Market } from "@monolimit/shared";
import {
  fetchNewPools,
  fetchOhlcv,
  fetchPoolStats,
  fetchTokenPools,
  fetchTopPools,
  fetchTrades,
  fetchTrendingPools,
  type Timeframe,
  type TopPool,
} from "../lib/gecko.ts";
import { buildDepth } from "../lib/depth.ts";
import { replacePath } from "../lib/router.ts";
import { fetchPairsMedia, fetchTokenMedia } from "../lib/dexscreener.ts";
import { useTerminal, type PoolInfo, type TokenMeta } from "../state/terminal.ts";

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
]);

/** Common quote tokens for the on-chain fallback scan. */
const QUOTE_CANDIDATES: Address[] = [
  ADDRESSES.WMON,
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", // USDC
];

export interface MarketLookup {
  token: TokenMeta;
  pool: PoolInfo;
}

/** "capricorn-monad" → "Capricorn" — for human-readable lookup errors. */
function prettyDex(id: string) {
  return id
    .replace(/-monad$/, "")
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

async function fetchErc20Meta(client: Client, address: Address): Promise<TokenMeta> {
  const [symbol, name, decimals] = await client.multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "name" },
      { address, abi: erc20Abi, functionName: "decimals" },
    ],
    allowFailure: false,
  });
  return { address, symbol, name, decimals };
}

/** Resolve a known pool's pair + fee + quote meta into a full MarketLookup. */
async function resolveMarketPool(
  client: Client,
  token: TokenMeta,
  poolAddress: Address,
  market: Market,
): Promise<MarketLookup> {
  const [token0, token1, fee] = await client.multicall({
    contracts: [
      { address: poolAddress, abi: POOL_ABI, functionName: "token0" },
      { address: poolAddress, abi: POOL_ABI, functionName: "token1" },
      { address: poolAddress, abi: POOL_ABI, functionName: "fee" },
    ],
    allowFailure: false,
  });
  const quoteAddr = (
    token0.toLowerCase() === token.address.toLowerCase() ? token1 : token0
  ) as Address;
  const quote = await fetchErc20Meta(client, quoteAddr);
  return {
    token,
    pool: {
      address: poolAddress,
      fee: Number(fee),
      tokenIsToken0: token0.toLowerCase() === token.address.toLowerCase(),
      quote,
      market,
    },
  };
}

/** On-chain fallback: TOKEN vs {WMON, USDC} across every market's factory + fee tier, deepest wins. */
async function factoryScan(
  client: Client,
  token: Address,
): Promise<{ pool: Address; market: Market } | null> {
  const combos = MARKETS.flatMap((market) =>
    QUOTE_CANDIDATES.flatMap((quote) => FEE_TIERS.map((fee) => ({ market, quote, fee }))),
  ).filter((c) => c.quote.toLowerCase() !== token.toLowerCase());
  const pools = await client.multicall({
    contracts: combos.map((c) => ({
      address: c.market.factory,
      abi: FACTORY_ABI,
      functionName: "getPool" as const,
      args: [token, c.quote, c.fee] as const,
    })),
    allowFailure: true,
  });
  const found: { pool: Address; market: Market }[] = [];
  pools.forEach((r, i) => {
    if (r.status === "success" && r.result !== "0x0000000000000000000000000000000000000000") {
      found.push({ pool: r.result, market: combos[i]!.market });
    }
  });
  if (found.length === 0) return null;
  const liqs = await client.multicall({
    contracts: found.map((f) => ({ address: f.pool, abi: POOL_ABI, functionName: "liquidity" as const })),
    allowFailure: false,
  });
  let best = 0;
  liqs.forEach((l, i) => {
    if ((l as bigint) > (liqs[best] as bigint)) best = i;
  });
  return found[best]!;
}

/**
 * Paste-an-address token lookup. MonoLimit runs a book per supported DEX
 * (Uniswap v3, Capricorn, PancakeSwap v3) — so we ask GeckoTerminal for the
 * token's deepest pool on any supported market first, then fall back to
 * scanning each market's factory for TOKEN/WMON and TOKEN/USDC pairs.
 */
export async function lookupMarket(client: Client, address: Address): Promise<MarketLookup> {
  // Not a contract at all → clearest possible message before any ABI call.
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(
      "No contract at this address on Monad — did you paste a wallet address, or a token from another chain?",
    );
  }

  let token: TokenMeta;
  try {
    token = await fetchErc20Meta(client, address);
  } catch {
    throw new Error("This contract isn't a standard ERC-20 token");
  }

  // Rate-limited gecko ≠ unsupported token — remember which one happened so
  // the error below doesn't lie about it.
  let geckoDown = false;
  const gecko = await fetchTokenPools(address).catch(() => {
    geckoDown = true;
    return [];
  });
  // Gecko sorts deepest-first, so the first supported dex wins.
  const supported = gecko.find((p) => MARKETS.some((m) => m.dexId === p.dexId));
  let poolAddress: Address | null;
  let market: Market | undefined;
  if (supported) {
    poolAddress = supported.address as Address;
    market = MARKETS.find((m) => m.dexId === supported.dexId)!;
  } else {
    const scanned = await factoryScan(client, address);
    poolAddress = scanned?.pool ?? null;
    market = scanned?.market;
  }
  if (!poolAddress || !market) {
    const elsewhere = gecko[0];
    throw new Error(
      geckoDown
        ? `Price API is rate-limited right now — couldn't look up ${token.symbol}'s pools. Try again in a few seconds.`
        : elsewhere
          ? `${token.symbol} only trades on ${prettyDex(elsewhere.dexId)} ($${Math.round(elsewhere.reserveUsd).toLocaleString()} liq) — MonoLimit supports ${MARKETS.map((m) => m.label).join(", ")}, and ${token.symbol} has no pool on any of them`
          : `${token.symbol} has no pool on a supported DEX (${MARKETS.map((m) => m.label).join(", ")})`,
    );
  }

  return resolveMarketPool(client, token, poolAddress, market);
}

/** Resolve a row from the top-pools table into a tradable market (exact pool). */
export async function lookupTopPool(client: Client, p: TopPool): Promise<MarketLookup> {
  const market = MARKETS.find((m) => m.dexId === p.dexId);
  if (!market) throw new Error(`${p.dexId} is not a supported DEX`);
  if (!isAddress(p.baseToken)) throw new Error("Bad token address from GeckoTerminal");
  const token = await fetchErc20Meta(client, p.baseToken as Address);
  return resolveMarketPool(client, token, p.address as Address, market);
}

export function useMarketLookup(rawQuery: string) {
  const client = usePublicClient();
  const query = rawQuery.trim();
  return useQuery({
    queryKey: ["market-lookup", query.toLowerCase()],
    enabled: !!client && isAddress(query),
    staleTime: 60_000,
    retry: 1,
    queryFn: () => lookupMarket(client!, query as Address),
  });
}

/**
 * Top Monad pools by 24h volume — every DEX gecko indexes, not just the ones
 * with a MonoLimit book: rows on other DEXes resolve through the token's
 * deepest supported pool on click (see PoolTable.pick).
 */
export function useTopPools(enabled: boolean) {
  return useQuery({
    queryKey: ["top-pools"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData, // rows persist while a refresh is inflight
    queryFn: () => fetchTopPools(),
  });
}

/** GeckoTerminal's trending Monad pools — home "Trending" tab. */
export function useTrendingPools(enabled: boolean) {
  return useQuery({
    queryKey: ["trending-pools"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: () => fetchTrendingPools(),
  });
}

/** Freshly created Monad pools — home "New pairs" tab. */
export function useNewPools(enabled: boolean) {
  return useQuery({
    queryKey: ["new-pools"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: () => fetchNewPools(),
  });
}

/** DexScreener icons for a list of pools (batched, 24h-fresh). */
export function usePairsMedia(pools: string[] | undefined) {
  const key = (pools ?? []).map((p) => p.toLowerCase()).sort();
  return useQuery({
    queryKey: ["pairs-media", key],
    enabled: key.length > 0,
    staleTime: 24 * 3_600_000, // token art doesn't churn
    placeholderData: keepPreviousData, // icons persist while a new batch loads
    queryFn: () => fetchPairsMedia(key),
  });
}

/** DexScreener icon for the selected token. */
export function useTokenMedia(token: Address | undefined) {
  return useQuery({
    queryKey: ["token-media", token?.toLowerCase()],
    enabled: !!token,
    staleTime: 24 * 3_600_000,
    retry: 1,
    queryFn: () => fetchTokenMedia(token!),
  });
}

/**
 * Shareable market URLs — basedbot-style `/token/monad/0x…`.
 * On load, a deep link resolves + selects that market; afterwards the path
 * mirrors whatever market is selected. Returns true while the deep link is
 * still resolving so the app can show a boot loader instead of flashing the
 * home page.
 */
export function useUrlMarketSync(): boolean {
  const client = usePublicClient();
  const { token, setMarket } = useTerminal();
  const applied = useRef(false);
  // A deep-linked path means a market is about to load — start in loading state.
  const [resolving, setResolving] = useState(() =>
    /^\/token\/monad\/0x[0-9a-fA-F]{40}$/.test(window.location.pathname),
  );

  useEffect(() => {
    if (applied.current || !client) return;
    applied.current = true;
    const m = window.location.pathname.match(/^\/token\/monad\/(0x[0-9a-fA-F]{40})$/);
    if (!m || useTerminal.getState().token) {
      setResolving(false);
      return;
    }
    lookupMarket(client, m[1] as Address)
      .then((r) => setMarket(r.token, r.pool))
      .catch(() => replacePath("/"))
      .finally(() => setResolving(false));
  }, [client, setMarket]);

  useEffect(() => {
    if (!token) return;
    // Fires only when the selected market changes — picking a token anywhere
    // (incl. on /bridge) lands you on its terminal URL.
    replacePath(`/token/monad/${token.address.toLowerCase()}`);
  }, [token]);

  return resolving;
}

/** Live pool tick + TOKEN price in the quote token from slot0 — same source the contract uses. */
export function useLivePrice(pool: PoolInfo | null, token: TokenMeta | null) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["live-price", pool?.address],
    enabled: !!client && !!pool && !!token,
    refetchInterval: 3_000,
    queryFn: async () => {
      const [, tick] = await client!.readContract({
        address: pool!.address,
        abi: POOL_ABI,
        functionName: "slot0",
      });
      const price = tickToExecutionPrice(
        Number(tick),
        token!.address,
        pool!.quote.address,
        token!.decimals,
        pool!.quote.decimals,
      );
      return { tick: Number(tick), price };
    },
  });
}

/** GeckoTerminal candles, refetched every 15s. */
export function useCandles(pool: PoolInfo | null, tf: Timeframe) {
  return useQuery({
    queryKey: ["candles", pool?.address, tf],
    enabled: !!pool,
    refetchInterval: 15_000,
    queryFn: () => fetchOhlcv(pool!.address, tf),
  });
}

export function usePoolStats(pool: PoolInfo | null) {
  return useQuery({
    queryKey: ["pool-stats", pool?.address],
    enabled: !!pool,
    refetchInterval: 15_000,
    queryFn: () => fetchPoolStats(pool!.address),
  });
}

const DEPTH_LEVELS = 12;

/**
 * Real order-book depth from the pool's tick liquidity: slot0 + tickSpacing +
 * liquidityNet at the surrounding initialized ticks, folded into a ladder.
 */
export function useDepth(pool: PoolInfo | null, token: TokenMeta | null) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["depth", pool?.address],
    enabled: !!client && !!pool && !!token,
    refetchInterval: 4_000,
    queryFn: async () => {
      const address = pool!.address;
      const [slot0, liquidity, spacing] = await client!.multicall({
        contracts: [
          { address, abi: POOL_ABI, functionName: "slot0" },
          { address, abi: POOL_ABI, functionName: "liquidity" },
          { address, abi: POOL_ABI, functionName: "tickSpacing" },
        ],
        allowFailure: false,
      });
      const tick = Number(slot0[1]);
      const tickSpacing = Number(spacing);
      const tickLow = Math.floor(tick / tickSpacing) * tickSpacing;
      const boundaries = Array.from(
        { length: DEPTH_LEVELS * 2 + 1 },
        (_, i) => tickLow + (i - DEPTH_LEVELS) * tickSpacing,
      );
      // Fork `ticks()` layouts can differ — tolerate per-tick decode failures.
      const ticksData = await client!.multicall({
        contracts: boundaries.map((t) => ({
          address,
          abi: POOL_ABI,
          functionName: "ticks" as const,
          args: [t] as const,
        })),
        allowFailure: true,
      });
      const liquidityNet = new Map<number, bigint>();
      ticksData.forEach((r, i) => {
        if (r.status === "success") liquidityNet.set(boundaries[i]!, r.result[1]);
      });
      return buildDepth({
        tick,
        sqrtPriceX96: slot0[0],
        liquidity,
        tickSpacing,
        tokenIsToken0: pool!.tokenIsToken0,
        token: token!,
        quote: pool!.quote,
        levels: DEPTH_LEVELS,
        liquidityNet,
      });
    },
  });
}

/** Recent pool trades (GeckoTerminal), refetched every 10s. */
export function useTrades(pool: PoolInfo | null) {
  return useQuery({
    queryKey: ["trades", pool?.address],
    enabled: !!pool,
    refetchInterval: 10_000,
    queryFn: () => fetchTrades(pool!.address),
  });
}
