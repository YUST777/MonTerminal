const GECKO_ORIGIN = "https://api.geckoterminal.com";
const GECKO_PATH_PREFIXES = ["/api/v2/networks/monad/", "/api/v2/simple/networks/monad/"];
const MAX_PATH_LENGTH = 4_096;
const GAP_MS = 2_200;
const BURST = 4;

type CacheEntry = {
  value: unknown;
  storedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let nextSlot = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function reserveSlot() {
  const now = Date.now();
  nextSlot = Math.max(nextSlot, now - GAP_MS * (BURST - 1));
  const start = nextSlot;
  nextSlot += GAP_MS;
  return Math.max(0, start - now);
}

function cachePolicy(path: string) {
  if (path.includes("/ohlcv/")) return { freshMs: 30_000, staleMs: 10 * 60_000 };
  if (path.includes("/trades") || path.includes("/pools/")) {
    return { freshMs: 15_000, staleMs: 5 * 60_000 };
  }
  return { freshMs: 60_000, staleMs: 15 * 60_000 };
}

function validatePath(path: unknown): string {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    throw new Error("Invalid Gecko request path");
  }
  if (path.includes("\\") || path.includes("://") || !path.startsWith("/api/v2/")) {
    throw new Error("Gecko request path is not allowed");
  }
  if (!GECKO_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new Error("Only Monad Gecko data is allowed");
  }
  const url = new URL(path, GECKO_ORIGIN);
  if (url.origin !== GECKO_ORIGIN || url.pathname !== path.split("?", 1)[0]) {
    throw new Error("Invalid Gecko request path");
  }
  return `${url.pathname}${url.search}`;
}

function staleValue(path: string) {
  const entry = cache.get(path);
  if (!entry) return undefined;
  return entry.value;
}

function storeCache(path: string, value: unknown) {
  cache.delete(path);
  cache.set(path, { value, storedAt: Date.now() });
  if (cache.size > 250) cache.delete(cache.keys().next().value!);
}

async function fetchGecko(path: string): Promise<unknown> {
  const policy = cachePolicy(path);
  const current = cache.get(path);
  const age = current ? Date.now() - current.storedAt : Infinity;
  if (current && age < policy.freshMs) return current.value;

  const pending = inflight.get(path);
  if (pending) return pending;

  const request = (async () => {
    await sleep(reserveSlot());
    const response = await fetch(`${GECKO_ORIGIN}${path}`, {
      headers: { accept: "application/json", "user-agent": "MonTerminal/1.0" },
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status === 429) {
      const stale = staleValue(path);
      if (stale !== undefined && age < policy.staleMs) return stale;
      await sleep(6_000);
      await sleep(reserveSlot());
      const retry = await fetch(`${GECKO_ORIGIN}${path}`, {
        headers: { accept: "application/json", "user-agent": "MonTerminal/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!retry.ok) throw new Error(`Gecko upstream ${retry.status}`);
      const value = await retry.json();
      storeCache(path, value);
      return value;
    }

    if (!response.ok) {
      const stale = staleValue(path);
      if (stale !== undefined && age < policy.staleMs) return stale;
      throw new Error(`Gecko upstream ${response.status}`);
    }

    const value = await response.json();
    storeCache(path, value);
    return value;
  })();

  inflight.set(path, request);
  request.finally(() => inflight.delete(path)).catch(() => {});
  return request;
}

export async function getGecko(path: unknown): Promise<unknown> {
  return fetchGecko(validatePath(path));
}
