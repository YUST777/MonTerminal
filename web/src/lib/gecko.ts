/**
 * GeckoTerminal free API — real OHLCV for Monad pools (no API key).
 * Docs: https://api.geckoterminal.com/docs
 */

const BASE = "https://api.geckoterminal.com/api/v2";

export interface Candle {
  timestamp: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const TF_PATH: Record<Timeframe, string> = {
  "1m": "minute?aggregate=1",
  "5m": "minute?aggregate=5",
  "15m": "minute?aggregate=15",
  "1h": "hour?aggregate=1",
  "4h": "hour?aggregate=4",
  "1d": "day?aggregate=1",
};

export async function fetchOhlcv(
  pool: string,
  tf: Timeframe,
  limit = 300,
  currency: "token" | "usd" = "token",
): Promise<Candle[]> {
  const res = await fetch(
    `${BASE}/networks/monad/pools/${pool}/ohlcv/${TF_PATH[tf]}&limit=${limit}&currency=${currency}`,
  );
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = await res.json();
  const list: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
  return list
    .map(([ts, o, h, l, c, v]) => ({
      timestamp: ts!,
      open: o!,
      high: h!,
      low: l!,
      close: c!,
      volume: v!,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export interface Trade {
  ts: number; // seconds
  side: "buy" | "sell";
  priceUsd: number;
  amount: number; // base-token units
  tx: string;
}

/** Recent trades for a pool — the "Trades" tab feed. */
export async function fetchTrades(pool: string): Promise<Trade[]> {
  const res = await fetch(`${BASE}/networks/monad/pools/${pool}/trades`);
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const data: any[] = (await res.json())?.data ?? [];
  return data
    .map((t) => {
      const a = t.attributes ?? {};
      const buy = a.kind === "buy";
      return {
        ts: Math.floor(Date.parse(a.block_timestamp) / 1000),
        side: (buy ? "buy" : "sell") as "buy" | "sell",
        priceUsd: Number(buy ? a.price_to_in_usd : a.price_from_in_usd),
        amount: Number(buy ? a.to_token_amount : a.from_token_amount),
        tx: String(a.tx_hash ?? ""),
      };
    })
    .filter((t) => Number.isFinite(t.ts))
    .sort((a, b) => b.ts - a.ts);
}

export interface PoolStats {
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  txns24h: number | null;
}

export async function fetchPoolStats(pool: string): Promise<PoolStats> {
  const res = await fetch(`${BASE}/networks/monad/pools/${pool}`);
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const attrs = (await res.json())?.data?.attributes ?? {};
  const t24 = attrs.transactions?.h24;
  return {
    priceUsd: attrs.base_token_price_usd ? Number(attrs.base_token_price_usd) : null,
    change24hPct: attrs.price_change_percentage?.h24
      ? Number(attrs.price_change_percentage.h24)
      : null,
    volume24hUsd: attrs.volume_usd?.h24 ? Number(attrs.volume_usd.h24) : null,
    liquidityUsd: attrs.reserve_in_usd ? Number(attrs.reserve_in_usd) : null,
    fdvUsd: attrs.fdv_usd ? Number(attrs.fdv_usd) : null,
    txns24h: t24 ? Number(t24.buys ?? 0) + Number(t24.sells ?? 0) : null,
  };
}

export interface GeckoPool {
  address: string;
  dexId: string;
  reserveUsd: number;
  name: string;
}

/** All indexed pools for a token, deepest first — used to discover its Uniswap v3 pool. */
export async function fetchTokenPools(token: string): Promise<GeckoPool[]> {
  const res = await fetch(`${BASE}/networks/monad/tokens/${token.toLowerCase()}/pools?page=1`);
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const data: any[] = (await res.json())?.data ?? [];
  return data
    .map((p) => ({
      address: String(p.attributes?.address ?? p.id?.replace(/^monad_/, "") ?? ""),
      dexId: String(p.relationships?.dex?.data?.id ?? ""),
      reserveUsd: Number(p.attributes?.reserve_in_usd ?? 0),
      name: String(p.attributes?.name ?? ""),
    }))
    .filter((p) => p.address.startsWith("0x"))
    .sort((a, b) => b.reserveUsd - a.reserveUsd);
}

export interface TopPool {
  address: string;
  dexId: string;
  /** "WMON / USDC 0.05%" → symbols parsed out below. */
  baseSymbol: string;
  quoteSymbol: string;
  baseToken: string; // 0x…
  priceUsd: number | null;
  change5mPct: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  volume24hUsd: number;
  reserveUsd: number;
  txns24h: number | null;
  fdvUsd: number | null;
  /** base-token logo from GeckoTerminal's `include=base_token` sideload */
  imageUrl: string | null;
  createdAtSec: number | null;
  /** base-token name + decimals from the same sideload (portfolio pricing) */
  baseName: string | null;
  baseDecimals: number | null;
}

/** Map of sideloaded `included` resources (base tokens) keyed by gecko id. */
type IncludedMap = Map<string, any>;

function buildIncluded(json: any): IncludedMap {
  const map: IncludedMap = new Map();
  for (const item of (json?.included ?? []) as any[]) {
    if (item?.id) map.set(String(item.id), item);
  }
  return map;
}

/** One gecko pool row → TopPool (shared by top / trending / new fetchers). */
function parsePoolRow(p: any, included?: IncludedMap): TopPool | null {
  const address = String(p.attributes?.address ?? "");
  if (!address.startsWith("0x")) return null;
  // name looks like "WMON / USDC 0.05%"
  const [rawBase = "?", rawQuote = "?"] = String(p.attributes?.name ?? "").split(" / ");
  const baseId = String(p.relationships?.base_token?.data?.id ?? "");
  const baseAttrs = included?.get(baseId)?.attributes;
  const image = String(baseAttrs?.image_url ?? "");
  const created = p.attributes?.pool_created_at ? Date.parse(p.attributes.pool_created_at) : NaN;
  const pct = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  const chg = p.attributes?.price_change_percentage ?? {};
  const t24 = p.attributes?.transactions?.h24;
  return {
    address,
    dexId: String(p.relationships?.dex?.data?.id ?? ""),
    baseSymbol: rawBase.trim(),
    quoteSymbol: rawQuote.trim().replace(/\s+[\d.]+%$/, ""),
    baseToken: baseId.replace(/^monad_/, ""),
    priceUsd: p.attributes?.base_token_price_usd
      ? Number(p.attributes.base_token_price_usd)
      : null,
    change5mPct: pct(chg.m5),
    change1hPct: pct(chg.h1),
    change24hPct: pct(chg.h24),
    volume24hUsd: Number(p.attributes?.volume_usd?.h24 ?? 0),
    reserveUsd: Number(p.attributes?.reserve_in_usd ?? 0),
    txns24h: t24 ? Number(t24.buys ?? 0) + Number(t24.sells ?? 0) : null,
    fdvUsd: p.attributes?.fdv_usd ? Number(p.attributes.fdv_usd) : null,
    imageUrl: image.startsWith("http") && !image.includes("missing.png") ? image : null,
    createdAtSec: Number.isFinite(created) ? Math.floor(created / 1000) : null,
    baseName: baseAttrs?.name ? String(baseAttrs.name) : null,
    baseDecimals: Number.isFinite(Number(baseAttrs?.decimals))
      ? Number(baseAttrs.decimals)
      : null,
  };
}

/** Fetch + dedupe N pages of a gecko pool-list endpoint. */
async function fetchPoolPages(path: string, pages: number): Promise<TopPool[]> {
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetch(`${BASE}${path}page=${i + 1}&include=base_token`).then((r) =>
        r.ok ? r.json() : { data: [] },
      ),
    ),
  );
  const seen = new Set<string>();
  const out: TopPool[] = [];
  for (const json of results) {
    const included = buildIncluded(json);
    for (const p of (json?.data ?? []) as any[]) {
      const row = parsePoolRow(p, included);
      if (!row || seen.has(row.address)) continue;
      seen.add(row.address);
      out.push(row);
    }
  }
  return out;
}

/** Top Monad pools by 24h volume — feeds the market-select table + home page. */
export async function fetchTopPools(pages = 5): Promise<TopPool[]> {
  return fetchPoolPages("/networks/monad/pools?sort=h24_volume_usd_desc&", pages);
}

/** GeckoTerminal's trending Monad pools (24h window) — home "Trending" tab. */
export async function fetchTrendingPools(): Promise<TopPool[]> {
  const res = await fetch(`${BASE}/networks/monad/trending_pools?include=base_token&duration=24h`);
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = await res.json();
  const included = buildIncluded(json);
  return ((json?.data ?? []) as any[])
    .map((p) => parsePoolRow(p, included))
    .filter((p): p is TopPool => p !== null);
}

/** Freshly created Monad pools — home "New pairs" tab. */
export async function fetchNewPools(pages = 3): Promise<TopPool[]> {
  return fetchPoolPages("/networks/monad/new_pools?", pages);
}

/**
 * Batch USD prices for tokens without a top-pools row (portfolio fallback).
 * Endpoint caps at 30 addresses per call.
 */
export async function fetchSimplePrices(addresses: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const res = await fetch(`${BASE}/simple/networks/monad/token_price/${batch.join(",")}`);
    if (!res.ok) continue;
    const prices = (await res.json())?.data?.attributes?.token_prices ?? {};
    for (const [addr, v] of Object.entries(prices)) {
      const n = Number(v);
      if (Number.isFinite(n)) map.set(addr.toLowerCase(), n);
    }
  }
  return map;
}
