/**
 * DexScreener free API — token icons for Monad pairs.
 * https://docs.dexscreener.com/api/reference (no key, 300 req/min)
 */

const BASE = "https://api.dexscreener.com";

/**
 * Icons for many pools at once — `/latest/dex/pairs/monad/{a,b,…}` accepts up
 * to 30 pair addresses per call. Returns a map of lowercased pool → icon URL.
 */
export async function fetchPairsMedia(pools: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < pools.length; i += 30) {
    const batch = pools.slice(i, i + 30);
    const res = await fetch(`${BASE}/latest/dex/pairs/monad/${batch.join(",")}`);
    if (!res.ok) continue; // partial media is fine — callers fall back to avatars
    const pairs: any[] = (await res.json())?.pairs ?? [];
    for (const p of pairs) {
      const addr = String(p?.pairAddress ?? "").toLowerCase();
      const icon = p?.info?.imageUrl;
      if (addr && typeof icon === "string") out.set(addr, icon);
    }
  }
  return out;
}

/** Icon for a single token (from its most liquid DexScreener pair). */
export async function fetchTokenMedia(token: string): Promise<{ icon: string | null }> {
  const res = await fetch(`${BASE}/token-pairs/v1/monad/${token}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const pairs: any[] = (await res.json()) ?? [];
  const icon = pairs.find((p) => typeof p?.info?.imageUrl === "string")?.info.imageUrl ?? null;
  return { icon };
}

export interface DsPair {
  address: string;
  dexId: string;
  liquidityUsd: number;
}

/** Every pool a token trades in, deepest first — the reliable (300 req/min,
 * CORS-ok) replacement for gecko's token-pools lookup. */
export async function fetchTokenPairs(token: string): Promise<DsPair[]> {
  const res = await fetch(`${BASE}/token-pairs/v1/monad/${token}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const pairs: any[] = (await res.json()) ?? [];
  return pairs
    .flatMap((p): DsPair[] => {
      const address = String(p?.pairAddress ?? "");
      if (!address.startsWith("0x")) return [];
      return [
        {
          address,
          dexId: String(p?.dexId ?? ""),
          liquidityUsd: Number(p?.liquidity?.usd ?? 0),
        },
      ];
    })
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

export interface DsPoolStats {
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  txns24h: number | null;
}

/** Pool header stats — same shape gecko's fetchPoolStats returns, but from
 * the API that doesn't 429 the whole app when a chart is open. */
export async function fetchPoolStatsDs(pool: string): Promise<DsPoolStats> {
  const res = await fetch(`${BASE}/latest/dex/pairs/monad/${pool}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const p = ((await res.json())?.pairs ?? [])[0];
  if (!p) throw new Error("pair not indexed");
  const t24 = p.txns?.h24;
  return {
    priceUsd: p.priceUsd != null ? Number(p.priceUsd) : null,
    change24hPct: p.priceChange?.h24 != null ? Number(p.priceChange.h24) : null,
    volume24hUsd: p.volume?.h24 != null ? Number(p.volume.h24) : null,
    liquidityUsd: p.liquidity?.usd != null ? Number(p.liquidity.usd) : null,
    fdvUsd: p.fdv != null ? Number(p.fdv) : null,
    txns24h: t24 ? Number(t24.buys ?? 0) + Number(t24.sells ?? 0) : null,
  };
}

export interface DsTokenPrice {
  priceUsd: number | null;
  change24hPct: number | null;
  /** deepest pair — feeds sparklines / value history */
  pool: string | null;
  icon: string | null;
}

/**
 * Batch USD prices — 30 tokens per call, parallel chunks, CORS-friendly and
 * 10× GeckoTerminal's rate limit. Deepest pair per token wins.
 */
export async function fetchTokenPrices(tokens: string[]): Promise<Map<string, DsTokenPrice>> {
  const out = new Map<string, DsTokenPrice>();
  const liq = new Map<string, number>();
  const unique = [...new Set(tokens.map((t) => t.toLowerCase()))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  await Promise.all(
    chunks.map(async (batch) => {
      const res = await fetch(`${BASE}/tokens/v1/monad/${batch.join(",")}`).catch(() => null);
      if (!res?.ok) return;
      const pairs: any[] = (await res.json()) ?? [];
      for (const p of pairs) {
        const base = String(p?.baseToken?.address ?? "").toLowerCase();
        if (!base.startsWith("0x")) continue;
        const l = Number(p?.liquidity?.usd ?? 0);
        if ((liq.get(base) ?? -1) >= l) continue;
        liq.set(base, l);
        out.set(base, {
          priceUsd: p?.priceUsd != null ? Number(p.priceUsd) : null,
          change24hPct: p?.priceChange?.h24 != null ? Number(p.priceChange.h24) : null,
          pool: typeof p?.pairAddress === "string" ? p.pairAddress : null,
          icon: typeof p?.info?.imageUrl === "string" ? p.info.imageUrl : null,
        });
      }
    }),
  );
  return out;
}
