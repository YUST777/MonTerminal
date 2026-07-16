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
