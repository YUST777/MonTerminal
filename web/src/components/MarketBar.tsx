import { useEffect, useMemo, useRef, useState } from "react";
import { MARKETS } from "@monolimit/shared";
import { useMarketLookup } from "../hooks/market.ts";
import { useTerminal, type PoolInfo, type TokenMeta } from "../state/terminal.ts";
import { useToasts } from "./Toasts.tsx";

/** localStorage-persisted favorite markets (market keyed by dexId, rehydrated). */
interface FavEntry {
  token: TokenMeta;
  pool: Omit<PoolInfo, "market"> & { marketDexId: string };
}

const FAV_KEY = "monolimit.favorites";

function loadFavs(): FavEntry[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function favToMarket(f: FavEntry): { token: TokenMeta; pool: PoolInfo } | null {
  const market = MARKETS.find((m) => m.dexId === f.pool.marketDexId);
  if (!market) return null;
  const { marketDexId: _, ...rest } = f.pool;
  return { token: f.token, pool: { ...rest, market } };
}

/**
 * Market selector row: current-market pill (opens the search dropdown) ·
 * favorite chips. Mirrors a perp-terminal market bar, but markets here are
 * pasted token addresses resolved to their deepest pool.
 */
export function MarketBar() {
  const { token, pool, setMarket } = useTerminal();
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState<FavEntry[]>(loadFavs);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const isFav = useMemo(
    () => !!token && favs.some((f) => f.token.address.toLowerCase() === token.address.toLowerCase()),
    [favs, token],
  );

  const toggleFav = () => {
    if (!token || !pool) return;
    const next = isFav
      ? favs.filter((f) => f.token.address.toLowerCase() !== token.address.toLowerCase())
      : [
          ...favs,
          { token, pool: { ...pool, market: undefined, marketDexId: pool.market.dexId } as never },
        ].slice(-8);
    setFavs(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  };

  return (
    <div className="flex h-9 items-center gap-2.5 border-b border-line bg-bg px-3">
      {/* current market pill */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-xs font-semibold ring-1 ring-line hover:ring-brand"
        >
          {token && pool ? (
            <>
              <TokenAvatar symbol={token.symbol} />
              <span>
                {token.symbol}-{pool.quote.symbol}
              </span>
              <span className="rounded bg-overlay px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted">
                {pool.market.label}
              </span>
            </>
          ) : (
            <span className="text-muted">Select market</span>
          )}
          <Chevron open={open} />
        </button>
        {open && <MarketDropdown favs={favs} onPicked={() => setOpen(false)} />}
      </div>

      <span className="h-4 w-px bg-line" aria-hidden />

      {/* favorites */}
      <button
        onClick={toggleFav}
        disabled={!token}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
        className={`text-sm leading-none ${isFav ? "text-warn" : "text-muted hover:text-warn"} disabled:opacity-30`}
      >
        {isFav ? "★" : "☆"}
      </button>
      {favs.length === 0 ? (
        <span className="text-xs text-muted">Star markets you trade often</span>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto">
          {favs.map((f) => {
            const m = favToMarket(f);
            if (!m) return null;
            const current = token?.address.toLowerCase() === f.token.address.toLowerCase();
            return (
              <button
                key={f.token.address}
                onClick={() => setMarket(m.token, m.pool)}
                className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${
                  current ? "bg-overlay text-fg" : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                {f.token.symbol}-{m.pool.quote.symbol}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Dropdown: paste-an-address lookup + favorite list — the market picker. */
function MarketDropdown({ favs, onPicked }: { favs: FavEntry[]; onPicked: () => void }) {
  const [query, setQuery] = useState("");
  const { data, isFetching, error } = useMarketLookup(query);
  const setMarket = useTerminal((s) => s.setMarket);
  const push = useToasts((s) => s.push);

  const select = () => {
    if (!data) return;
    setMarket(data.token, data.pool);
    push(
      "info",
      `Loaded ${data.token.symbol}/${data.pool.quote.symbol} — ${data.pool.market.label} ${data.pool.fee / 10_000}% pool`,
    );
    setQuery("");
    onPicked();
  };

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-96 rounded-md border border-line bg-overlay p-1.5 shadow-2xl">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Paste any Monad token address (0x…)"
        spellCheck={false}
        className="w-full rounded border border-line bg-raised px-2 py-1.5 text-xs outline-none placeholder:text-muted focus:border-brand"
      />
      {query && (
        <div className="mt-1 text-xs">
          {isFetching && <div className="px-2 py-1.5 text-muted">Looking up…</div>}
          {error && <div className="px-2 py-1.5 text-down">{(error as Error).message}</div>}
          {data && (
            <button
              onClick={select}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-raised"
            >
              <span className="flex items-center gap-2">
                <TokenAvatar symbol={data.token.symbol} />
                <span className="font-semibold">{data.token.symbol}</span>
                <span className="text-muted">{data.token.name}</span>
              </span>
              <span className="text-xs text-muted">
                {data.pool.market.label} · /{data.pool.quote.symbol} · {data.pool.fee / 10_000}%
              </span>
            </button>
          )}
        </div>
      )}
      {!query && favs.length > 0 && (
        <div className="mt-1">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            Favorites
          </div>
          {favs.map((f) => {
            const m = favToMarket(f);
            if (!m) return null;
            return (
              <button
                key={f.token.address}
                onClick={() => {
                  setMarket(m.token, m.pool);
                  onPicked();
                }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-raised"
              >
                <span className="flex items-center gap-2">
                  <TokenAvatar symbol={f.token.symbol} />
                  {f.token.symbol}-{m.pool.quote.symbol}
                </span>
                <span className="text-xs text-muted">{m.pool.market.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {!query && favs.length === 0 && (
        <div className="px-2 py-1.5 text-[11px] text-muted">
          Any token with a pool on {MARKETS.map((m) => m.label).join(", ")} works.
        </div>
      )}
    </div>
  );
}

function TokenAvatar({ symbol }: { symbol: string }) {
  return (
    <span className="flex size-4 items-center justify-center rounded-full bg-overlay text-[9px] font-bold text-brand ring-1 ring-line">
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`size-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      aria-hidden
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
