import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, hexToString, isAddress, parseAbi, type Address, type Hex } from "viem";
import { ADDRESSES, FEE_TIERS, MARKETS, monad, tickToExecutionPrice, type Market } from "@monolimit/shared";
import {
  fetchNewPools,
  fetchOhlcv,
  fetchPoolStats,
  fetchTopPools,
  fetchTrades,
  fetchTrendingPools,
  type Timeframe,
  type TopPool,
} from "../lib/gecko.ts";
import { buildDepth } from "../lib/depth.ts";
import { replacePath, usePathname } from "../lib/router.ts";
import {
  fetchPairsMedia,
  fetchPoolStatsDs,
  fetchTokenMedia,
  fetchTokenPairs,
} from "../lib/dexscreener.ts";
import { fetchOnchainIcons, fetchOnchainTokenInfo } from "../lib/tokenInfo.ts";
import { useTerminal, type PoolInfo, type TokenMeta } from "../state/terminal.ts";

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function factory() view returns (address)",
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

export interface TokenLookup {
  token: TokenMeta;
  pool: PoolInfo | null;
  marketNotice: string | null;
}

const tokenLookupPromises = new Map<string, Promise<TokenLookup>>();

/** "capricorn-monad" → "Capricorn" — for human-readable lookup errors. */
function prettyDex(id: string) {
  return id
    .replace(/-monad$/, "")
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** MKR-style tokens return bytes32 instead of string for symbol/name. */
const BYTES32_META_ABI = parseAbi([
  "function symbol() view returns (bytes32)",
  "function name() view returns (bytes32)",
]);

const trimBytes32 = (v: Hex) => hexToString(v, { size: 32 }).replace(/\0+$/, "");

/**
 * Token metadata that survives non-standard contracts: decimals is required
 * (all the math needs it), but symbol/name degrade gracefully — string ABI →
 * bytes32 ABI → caller-provided fallback (e.g. gecko's symbol) → address stub.
 */
async function fetchErc20Meta(
  client: Client,
  address: Address,
  fallback?: { symbol?: string; name?: string },
): Promise<TokenMeta> {
  const [decimals, [sym, nam]] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.multicall({
      contracts: [
        { address, abi: erc20Abi, functionName: "symbol" },
        { address, abi: erc20Abi, functionName: "name" },
      ],
      allowFailure: true,
    }),
  ]);
  let symbol = sym.status === "success" ? sym.result : undefined;
  let name = nam.status === "success" ? nam.result : undefined;
  if (symbol === undefined || name === undefined) {
    const [sym32, nam32] = await client.multicall({
      contracts: [
        { address, abi: BYTES32_META_ABI, functionName: "symbol" },
        { address, abi: BYTES32_META_ABI, functionName: "name" },
      ],
      allowFailure: true,
    });
    symbol ??= sym32.status === "success" ? trimBytes32(sym32.result) : undefined;
    name ??= nam32.status === "success" ? trimBytes32(nam32.result) : undefined;
  }
  symbol ||= fallback?.symbol || `${address.slice(0, 6)}…${address.slice(-4)}`;
  name ||= fallback?.name || symbol;
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
  // one broken/fork pool must not brick the whole scan — failed reads count as empty
  const liqs = await client.multicall({
    contracts: found.map((f) => ({ address: f.pool, abi: POOL_ABI, functionName: "liquidity" as const })),
    allowFailure: true,
  });
  let best = 0;
  let bestLiq = -1n;
  liqs.forEach((r, i) => {
    const liq = r.status === "success" ? (r.result as bigint) : 0n;
    if (liq > bestLiq) {
      bestLiq = liq;
      best = i;
    }
  });
  return found[best]!;
}

/**
 * Which MonTerminal market (if any) a pool belongs to — decided by the pool's
 * ON-CHAIN factory(), never by an indexer's dex label. GeckoTerminal tags
 * launchpad frontends (pons.family & co.) with their own dexId even though
 * their pools live on the exact same Uniswap v3 factory we trade on.
 */
async function marketForPool(client: Client, pool: Address): Promise<Market | null> {
  const factory = await client
    .readContract({ address: pool, abi: POOL_ABI, functionName: "factory" })
    .catch(() => null);
  if (!factory) return null;
  return MARKETS.find((m) => m.factory.toLowerCase() === factory.toLowerCase()) ?? null;
}

/**
 * Paste-an-address token lookup. Pools come from DexScreener (CORS-friendly,
 * 300 req/min — no gecko rate limits on the click path); each candidate is
 * matched to a MonTerminal market by its on-chain factory. Last resort: scan
 * every market's factory for TOKEN/WMON and TOKEN/USDC pairs directly.
 */
export async function lookupToken(client: Client, address: Address): Promise<TokenLookup> {
  const [code, meta, pairs] = await Promise.all([
    client.getCode({ address }),
    fetchErc20Meta(client, address).catch(() => null),
    fetchTokenPairs(address).catch(() => []),
  ]);
  // Not a contract at all → clearest possible message after the parallel probe.
  if (!code || code === "0x") {
    throw new Error(
      "No contract at this address on Monad — did you paste a wallet address, or a token from another chain?",
    );
  }

  if (!meta) throw new Error("This contract isn't a standard ERC-20 token");
  const token = meta;

  const candidates = pairs.slice(0, 8).filter((p) => isAddress(p.address));
  if (candidates.length > 0) {
    const factories = await client.multicall({
      contracts: candidates.map((p) => ({
        address: p.address as Address,
        abi: POOL_ABI,
        functionName: "factory" as const,
      })),
      allowFailure: true,
    });
    // deepest-first: first pool sitting on a factory we run a book for wins
    for (let i = 0; i < candidates.length; i++) {
      const f = factories[i]!;
      if (f.status !== "success") continue;
      const market = MARKETS.find((m) => m.factory.toLowerCase() === f.result.toLowerCase());
      if (market) {
        const resolved = await resolveMarketPool(client, token, candidates[i]!.address as Address, market);
        return { ...resolved, marketNotice: null };
      }
    }
  }

  const scanned = await factoryScan(client, address);
  if (scanned) {
    const resolved = await resolveMarketPool(client, token, scanned.pool, scanned.market);
    return { ...resolved, marketNotice: null };
  }

  const elsewhere = candidates[0];
  return {
    token,
    pool: null,
    marketNotice: elsewhere
      ? `${token.symbol}'s pools (deepest: $${Math.round(elsewhere.liquidityUsd).toLocaleString()} on ${prettyDex(elsewhere.dexId)}) aren't on a factory MonTerminal trades on (${MARKETS.map((m) => m.label).join(", ")})`
      : `${token.symbol} has no pool on a supported DEX (${MARKETS.map((m) => m.label).join(", ")})`,
  };
}

interface StoredTokenLookup {
  savedAt: number;
  token: TokenMeta;
  pool: null | {
    address: Address;
    fee: number;
    tokenIsToken0: boolean;
    quote: TokenMeta;
    marketDexId: string;
  };
  marketNotice: string | null;
}

const TOKEN_CACHE_PREFIX = "monterminal.market:";

function loadStoredTokenLookup(address: Address): TokenLookup | null {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredTokenLookup;
    const maxAge = stored.pool ? 24 * 60 * 60_000 : 2 * 60_000;
    if (Date.now() - stored.savedAt > maxAge || stored.token.address.toLowerCase() !== address.toLowerCase()) {
      return null;
    }
    if (!stored.pool) return { token: stored.token, pool: null, marketNotice: stored.marketNotice };
    const market = MARKETS.find((candidate) => candidate.dexId === stored.pool!.marketDexId);
    if (!market) return null;
    return {
      token: stored.token,
      pool: {
        address: stored.pool.address,
        fee: stored.pool.fee,
        tokenIsToken0: stored.pool.tokenIsToken0,
        quote: stored.pool.quote,
        market,
      },
      marketNotice: stored.marketNotice,
    };
  } catch {
    return null;
  }
}

function storeTokenLookup(address: Address, result: TokenLookup) {
  try {
    const stored: StoredTokenLookup = {
      savedAt: Date.now(),
      token: result.token,
      pool: result.pool
        ? {
            address: result.pool.address,
            fee: result.pool.fee,
            tokenIsToken0: result.pool.tokenIsToken0,
            quote: result.pool.quote,
            marketDexId: result.pool.market.dexId,
          }
        : null,
      marketNotice: result.marketNotice,
    };
    localStorage.setItem(TOKEN_CACHE_PREFIX + address.toLowerCase(), JSON.stringify(stored));
  } catch {
    // Private browsing or quota failures only lose the warm-start optimization.
  }
}

/** Share one lookup between navigation/search and reuse verified markets across reloads. */
export function lookupTokenCached(client: Client, address: Address): Promise<TokenLookup> {
  const key = address.toLowerCase();
  const existing = tokenLookupPromises.get(key);
  if (existing) return existing;
  const stored = loadStoredTokenLookup(address);
  if (stored) return Promise.resolve(stored);
  const pending = lookupToken(client, address)
    .then((result) => {
      storeTokenLookup(address, result);
      return result;
    })
    .catch((error) => {
      tokenLookupPromises.delete(key);
      throw error;
    });
  tokenLookupPromises.set(key, pending);
  return pending;
}

export async function lookupMarket(client: Client, address: Address): Promise<MarketLookup> {
  const result = await lookupToken(client, address);
  if (!result.pool) throw new Error(result.marketNotice ?? "No supported trading pool found");
  return { token: result.token, pool: result.pool };
}

/**
 * Resolve a row from the pools tables into a tradable market. The row's exact
 * pool opens whenever its on-chain factory is one we trade on — regardless of
 * what dexId gecko labelled it with. Only pools on foreign factories fall
 * back to the token's deepest supported pool.
 */
export async function lookupTopPool(client: Client, p: TopPool): Promise<MarketLookup> {
  if (!isAddress(p.baseToken)) throw new Error("Bad token address from GeckoTerminal");
  let market = MARKETS.find((m) => m.dexId === p.dexId) ?? null;
  if (!market && isAddress(p.address)) market = await marketForPool(client, p.address as Address);
  if (!market) return lookupMarket(client, p.baseToken as Address);
  const token = await fetchErc20Meta(client, p.baseToken as Address, { symbol: p.baseSymbol });
  return resolveMarketPool(client, token, p.address as Address, market);
}

export function useTokenLookup(rawQuery: string) {
  const client = usePublicClient({ chainId: monad.id });
  const query = rawQuery.trim();
  return useQuery({
    queryKey: ["token-lookup", query.toLowerCase()],
    enabled: !!client && isAddress(query),
    staleTime: 60_000,
    retry: 1,
    queryFn: () => lookupTokenCached(client!, query as Address),
  });
}

/**
 * Top Monad pools by 24h volume — every DEX gecko indexes, not just the ones
 * with a MonTerminal book: rows on other DEXes resolve through the token's
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

/**
 * On-chain logos via pons `getTokenInfo()` — one multicall for a whole table.
 * Covers brand-new launchpad tokens hours before any indexer has their art.
 */
export function useOnchainIcons(tokens: string[] | undefined) {
  const client = usePublicClient({ chainId: monad.id });
  const key = [...new Set((tokens ?? []).map((t) => t.toLowerCase()))].sort();
  return useQuery({
    queryKey: ["onchain-icons", key],
    enabled: !!client && key.length > 0,
    staleTime: 24 * 3_600_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchOnchainIcons(client!, key.filter((t) => isAddress(t)) as Address[]),
  });
}

/** Icon + description + social links for the selected token: DexScreener → on-chain. */
export function useTokenMedia(token: Address | undefined) {
  const client = usePublicClient({ chainId: monad.id });
  return useQuery({
    queryKey: ["token-media", token?.toLowerCase()],
    enabled: !!client && !!token,
    staleTime: 24 * 3_600_000,
    retry: 1,
    queryFn: async () => {
      const [ds, onchain] = await Promise.all([
        fetchTokenMedia(token!).catch(() => ({ icon: null })),
        fetchOnchainTokenInfo(client!, token!),
      ]);
      return {
        icon: ds.icon ?? onchain?.imageUrl ?? null,
        description: onchain?.description ?? null,
        links: onchain?.links ?? [],
        creator: onchain?.creator ?? null,
      };
    },
  });
}

/**
 * Shareable market URLs — basedbot-style `/token/monad/0x…`.
 * On load, a deep link resolves + selects that market; afterwards the path
 * mirrors whatever market is selected. Returns true while the deep link is
 * still resolving so the app can show a boot loader instead of flashing the
 * home page.
 */
export function useUrlMarketSync(): { resolving: boolean; error: string | null } {
  const client = usePublicClient({ chainId: monad.id });
  const { token, setMarket, setDetectedToken, clearMarket } = useTerminal();
  const path = usePathname();
  const inFlight = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A deep-linked path means a market is about to load — start in loading state.
  const [resolving, setResolving] = useState(() =>
    /^\/token\/monad\/0x[0-9a-fA-F]{40}$/.test(window.location.pathname),
  );

  // Resolve /token/… whenever the path points at a market the store doesn't
  // hold yet — first load AND later navigations (e.g. the Spot tab restoring
  // the last-traded market after a reload).
  useEffect(() => {
    if (!client) return;
    const m = path.match(/^\/token\/monad\/(0x[0-9a-fA-F]{40})$/);
    if (!m) {
      setResolving(false);
      setError(null);
      return;
    }
    const addr = m[1]!.toLowerCase();
    const current = useTerminal.getState().token;
    if (current && current.address.toLowerCase() === addr) {
      setResolving(false);
      setError(null);
      return;
    }
    if (inFlight.current === addr) return;
    inFlight.current = addr;
    clearMarket();
    setResolving(true);
    setError(null);
    lookupTokenCached(client, m[1] as Address)
      .then((r) => {
        if (r.pool) setMarket(r.token, r.pool);
        else setDetectedToken(r.token, r.marketNotice ?? "No supported trading pool found");
      })
      .catch((reason: unknown) => {
        clearMarket();
        setError(reason instanceof Error ? reason.message : "Unable to inspect this contract");
      })
      .finally(() => {
        inFlight.current = null;
        setResolving(false);
      });
  }, [client, path, setMarket, setDetectedToken, clearMarket]);

  useEffect(() => {
    if (!token) return;
    // Fires only when the selected market changes — picking a token anywhere
    // (incl. on /bridge) lands you on its terminal URL.
    replacePath(`/token/monad/${token.address.toLowerCase()}`);
  }, [token]);

  return { resolving, error };
}

/** Live pool tick + TOKEN price in the quote token from slot0 — same source the contract uses. */
export function useLivePrice(pool: PoolInfo | null, token: TokenMeta | null) {
  const client = usePublicClient({ chainId: monad.id });
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

/** GeckoTerminal candles — the one thing only gecko has. 30s keeps the
 * whole terminal at ~2 gecko calls/min, far under its 30/min cap. */
export function useCandles(pool: PoolInfo | null, tf: Timeframe) {
  return useQuery({
    queryKey: ["candles", pool?.address, tf],
    enabled: !!pool,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1_500 * 2 ** attempt, 6_000),
    placeholderData: keepPreviousData,
    queryFn: () => fetchOhlcv(pool!.address, tf),
  });
}

/** Header stats from DexScreener (300 req/min, CORS-ok); gecko only if the
 * pair isn't indexed there yet. */
export function usePoolStats(pool: PoolInfo | null) {
  return useQuery({
    queryKey: ["pool-stats", pool?.address],
    enabled: !!pool,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchPoolStatsDs(pool!.address).catch(() => fetchPoolStats(pool!.address)),
  });
}

const DEPTH_LEVELS = 12;

/**
 * Real order-book depth from the pool's tick liquidity: slot0 + tickSpacing +
 * liquidityNet at the surrounding initialized ticks, folded into a ladder.
 */
export function useDepth(pool: PoolInfo | null, token: TokenMeta | null) {
  const client = usePublicClient({ chainId: monad.id });
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

/** Recent pool trades (GeckoTerminal), refetched every 15s. */
export function useTrades(pool: PoolInfo | null) {
  return useQuery({
    queryKey: ["trades", pool?.address],
    enabled: !!pool,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchTrades(pool!.address),
  });
}
