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
}

export async function fetchPoolStats(pool: string): Promise<PoolStats> {
  const res = await fetch(`${BASE}/networks/monad/pools/${pool}`);
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const attrs = (await res.json())?.data?.attributes ?? {};
  return {
    priceUsd: attrs.base_token_price_usd ? Number(attrs.base_token_price_usd) : null,
    change24hPct: attrs.price_change_percentage?.h24
      ? Number(attrs.price_change_percentage.h24)
      : null,
    volume24hUsd: attrs.volume_usd?.h24 ? Number(attrs.volume_usd.h24) : null,
  };
}
