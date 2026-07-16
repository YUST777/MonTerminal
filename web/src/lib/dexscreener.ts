/**
 * DexScreener free API — token icons + header banners for Monad pairs.
 * https://docs.dexscreener.com/api/reference (no key, 300 req/min)
 */

const BASE = "https://api.dexscreener.com";

export interface PairMedia {
  icon: string | null;
  banner: string | null;
}

function parseInfo(info: any): PairMedia {
  return {
    icon: typeof info?.imageUrl === "string" ? info.imageUrl : null,
    banner: typeof info?.header === "string" ? info.header : null,
  };
}

/**
 * Media for many pools at once — `/latest/dex/pairs/monad/{a,b,…}` accepts up
 * to 30 pair addresses per call. Returns a map keyed by lowercased pool.
 */
export async function fetchPairsMedia(pools: string[]): Promise<Map<string, PairMedia>> {
  const out = new Map<string, PairMedia>();
  for (let i = 0; i < pools.length; i += 30) {
    const batch = pools.slice(i, i + 30);
    const res = await fetch(`${BASE}/latest/dex/pairs/monad/${batch.join(",")}`);
    if (!res.ok) continue; // partial media is fine — callers fall back to avatars
    const pairs: any[] = (await res.json())?.pairs ?? [];
    for (const p of pairs) {
      const addr = String(p?.pairAddress ?? "").toLowerCase();
      if (addr && p?.info) out.set(addr, parseInfo(p.info));
    }
  }
  return out;
}

/** Icon + banner for a single token (from its most liquid DexScreener pair). */
export async function fetchTokenMedia(token: string): Promise<PairMedia> {
  const res = await fetch(`${BASE}/token-pairs/v1/monad/${token}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const pairs: any[] = (await res.json()) ?? [];
  const withInfo = pairs.find((p) => p?.info);
  return withInfo ? parseInfo(withInfo.info) : { icon: null, banner: null };
}
