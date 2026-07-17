/**
 * Supabase-backed shared cache (raw PostgREST, no SDK) — real GeckoTerminal
 * responses are persisted per request key, so the next visitor paints
 * instantly instead of waiting out the free-tier rate limit. Fully gated on
 * env: without VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY the app skips it.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supaEnabled = !!URL && !!KEY;

function headers(): Record<string, string> {
  return {
    apikey: KEY!,
    Authorization: `Bearer ${KEY!}`,
    "Content-Type": "application/json",
  };
}

export async function supaGet(
  key: string,
): Promise<{ payload: unknown; ageMs: number } | null> {
  if (!supaEnabled) return null;
  try {
    const res = await fetch(
      `${URL}/rest/v1/gecko_cache?key=eq.${encodeURIComponent(key)}&select=payload,updated_at`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const [row] = (await res.json()) as { payload: unknown; updated_at: string }[];
    if (!row) return null;
    return { payload: row.payload, ageMs: Date.now() - new Date(row.updated_at).getTime() };
  } catch {
    return null;
  }
}

/** Fire-and-forget upsert — cache writes must never slow the UI down. */
export function supaPut(key: string, payload: unknown) {
  if (!supaEnabled) return;
  fetch(`${URL}/rest/v1/gecko_cache?on_conflict=key`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, payload, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}
