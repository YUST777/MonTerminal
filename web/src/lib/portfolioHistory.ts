export type PortfolioHistoryWindow = "week" | "month";

export interface PortfolioPricePoint {
  timestamp: number;
  close: number;
}

export interface PortfolioHistoryBundle {
  series: Record<string, PortfolioPricePoint[]>;
  fetchedAt: number;
}

const FRESH_MS = 10 * 60_000;
const STALE_MS = 12 * 60 * 60_000;
const inflight = new Map<string, Promise<PortfolioHistoryBundle>>();

function cacheKey(pools: string[], window: PortfolioHistoryWindow) {
  return `portfolio-history:v1:${window}:${pools.join(",")}`;
}

function readCache(key: string): PortfolioHistoryBundle | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioHistoryBundle;
    return parsed && typeof parsed.fetchedAt === "number" && parsed.series ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: PortfolioHistoryBundle) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

async function fetchLive(pools: string[], window: PortfolioHistoryWindow, key: string) {
  const response = await fetch("/api/portfolio-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pools, window }),
    signal: AbortSignal.timeout(12_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.series) throw new Error(json?.error ?? "Portfolio history unavailable");

  const series: Record<string, PortfolioPricePoint[]> = {};
  for (const [pool, rows] of Object.entries(json.series as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    series[pool.toLowerCase()] = rows.flatMap((row): PortfolioPricePoint[] => {
      if (!Array.isArray(row)) return [];
      const timestamp = Number(row[0]);
      const close = Number(row[1]);
      return Number.isFinite(timestamp) && Number.isFinite(close) && close > 0
        ? [{ timestamp, close }]
        : [];
    });
  }
  const result = { series, fetchedAt: Number(json.fetchedAt) || Date.now() };
  writeCache(key, result);
  return result;
}

export async function fetchPortfolioHistory(
  rawPools: string[],
  window: PortfolioHistoryWindow,
): Promise<PortfolioHistoryBundle> {
  const pools = [...new Set(rawPools.map((pool) => pool.toLowerCase()))].sort();
  if (pools.length === 0) return { series: {}, fetchedAt: Date.now() };
  const key = cacheKey(pools, window);
  const cached = readCache(key);
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;
  if (cached && age < FRESH_MS) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetchLive(pools, window, key).finally(() => inflight.delete(key));
  inflight.set(key, request);

  if (cached && age < STALE_MS) {
    void request.catch(() => {});
    return cached;
  }
  return request;
}
