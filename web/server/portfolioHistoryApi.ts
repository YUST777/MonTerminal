const GECKO_BASE = "https://api.geckoterminal.com/api/v2";
const MAX_POOLS = 10;
const FRESH_MS = 10 * 60_000;
const STALE_MS = 12 * 60 * 60_000;

export type PortfolioHistoryWindow = "week" | "month";
export type PortfolioPricePoint = [timestamp: number, close: number];

export interface PortfolioHistoryResponse {
  series: Record<string, PortfolioPricePoint[]>;
  fetchedAt: number;
}

interface CachedSeries {
  points: PortfolioPricePoint[];
  updatedAt: number;
}

const cache = new Map<string, CachedSeries>();
const inflight = new Map<string, Promise<PortfolioPricePoint[]>>();

function parseRequest(body: unknown): { pools: string[]; window: PortfolioHistoryWindow } {
  if (!body || typeof body !== "object") throw new Error("Invalid history request");
  const raw = body as { pools?: unknown; window?: unknown };
  if (raw.window !== "week" && raw.window !== "month") throw new Error("Invalid history window");
  if (!Array.isArray(raw.pools)) throw new Error("Pools must be an array");

  const pools = [...new Set(raw.pools.map((pool) => String(pool).toLowerCase()))];
  if (pools.length === 0 || pools.length > MAX_POOLS) throw new Error("Invalid pool count");
  if (pools.some((pool) => !/^0x[0-9a-f]{40,64}$/.test(pool))) {
    throw new Error("Invalid pool address");
  }
  return { pools, window: raw.window };
}

function historyConfig(window: PortfolioHistoryWindow) {
  return window === "week"
    ? { path: "hour?aggregate=1", limit: 168 }
    : { path: "hour?aggregate=4", limit: 180 };
}

async function fetchLive(pool: string, window: PortfolioHistoryWindow): Promise<PortfolioPricePoint[]> {
  const config = historyConfig(window);
  const response = await fetch(
    `${GECKO_BASE}/networks/monad/pools/${encodeURIComponent(pool)}/ohlcv/${config.path}&limit=${config.limit}&currency=usd`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`History upstream ${response.status}`);
  const json = await response.json();
  const rows: unknown[] = json?.data?.attributes?.ohlcv_list ?? [];
  return rows
    .flatMap((row): PortfolioPricePoint[] => {
      if (!Array.isArray(row)) return [];
      const timestamp = Number(row[0]);
      const close = Number(row[4]);
      return Number.isFinite(timestamp) && Number.isFinite(close) && close > 0
        ? [[timestamp, close]]
        : [];
    })
    .sort((a, b) => a[0] - b[0]);
}

async function getSeries(pool: string, window: PortfolioHistoryWindow) {
  const key = `${window}:${pool}`;
  const existing = cache.get(key);
  const age = existing ? Date.now() - existing.updatedAt : Infinity;
  if (existing && age < FRESH_MS) return existing.points;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchLive(pool, window)
    .then((points) => {
      if (points.length > 1) cache.set(key, { points, updatedAt: Date.now() });
      return points;
    })
    .catch((error) => {
      if (existing && age < STALE_MS) return existing.points;
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export async function getPortfolioHistory(body: unknown): Promise<PortfolioHistoryResponse> {
  const { pools, window } = parseRequest(body);
  const rows = await Promise.all(
    pools.map(async (pool) => {
      const points = await getSeries(pool, window).catch(() => []);
      return [pool, points] as const;
    }),
  );
  return { series: Object.fromEntries(rows), fetchedAt: Date.now() };
}
