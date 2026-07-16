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

export async function fetchOhlcv(pool: string, tf: Timeframe, limit = 300): Promise<Candle[]> {
  const res = await fetch(
    `${BASE}/networks/monad/pools/${pool}/ohlcv/${TF_PATH[tf]}&limit=${limit}&currency=token`,
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
