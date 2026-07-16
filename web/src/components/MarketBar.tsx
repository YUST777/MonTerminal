import { useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress } from "viem";
import { MARKETS } from "@monolimit/shared";
import {
  lookupTopPool,
  useMarketLookup,
  useTopPools,
  type MarketLookup,
} from "../hooks/market.ts";
import type { TopPool } from "../lib/gecko.ts";
import { fmtPct, fmtUsd } from "../lib/format.ts";
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
        {open && <MarketDropdown onPicked={() => setOpen(false)} />}
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

/** Dropdown: hypeterminal-style select-market panel — search (symbols or a
 * pasted 0x address), DEX filter tabs, sortable volume-ranked pool table. */
type SortKey = "price" | "change" | "volume" | "liquidity";
const SORT_LABEL: Record<SortKey, string> = {
  price: "Price",
  change: "24h Change",
  volume: "Volume",
  liquidity: "Liquidity",
};

function MarketDropdown({ onPicked }: { onPicked: () => void }) {
  const [query, setQuery] = useState("");
  const [dexTab, setDexTab] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "volume", dir: -1 });
  const [resolving, setResolving] = useState<string | null>(null);
  const client = usePublicClient();
  const isAddr = isAddress(query.trim());
  const { data: lookup, isFetching, error } = useMarketLookup(query);
  const { data: pools, isLoading } = useTopPools(true);
  const setMarket = useTerminal((s) => s.setMarket);
  const push = useToasts((s) => s.push);

  const rows = useMemo(() => {
    if (!pools) return [];
    const q = query.trim().toLowerCase();
    const val = (p: TopPool) =>
      sort.key === "price"
        ? (p.priceUsd ?? 0)
        : sort.key === "change"
          ? (p.change24hPct ?? 0)
          : sort.key === "volume"
            ? p.volume24hUsd
            : p.reserveUsd;
    return pools
      .filter((p) => dexTab === "all" || p.dexId === dexTab)
      .filter(
        (p) =>
          !q ||
          isAddr ||
          p.baseSymbol.toLowerCase().includes(q) ||
          p.quoteSymbol.toLowerCase().includes(q),
      )
      .sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [pools, dexTab, query, isAddr, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }));

  const select = (r: MarketLookup) => {
    setMarket(r.token, r.pool);
    push(
      "info",
      `Loaded ${r.token.symbol}/${r.pool.quote.symbol} — ${r.pool.market.label} ${r.pool.fee / 10_000}% pool`,
    );
    setQuery("");
    onPicked();
  };

  const pickRow = async (p: TopPool) => {
    if (!client || resolving) return;
    setResolving(p.address);
    try {
      select(await lookupTopPool(client, p));
    } catch (err) {
      push("error", (err as Error).message.slice(0, 140));
    } finally {
      setResolving(null);
    }
  };

  const grid = "grid grid-cols-[1.5fr_1fr_0.9fr_1fr_1fr] items-center gap-2";

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[38rem] rounded-md border border-line bg-overlay shadow-2xl">
      <div className="px-3 pt-2.5 text-sm font-semibold">Select market</div>
      <div className="p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markets or paste a token address (0x…)"
          spellCheck={false}
          className="w-full rounded border border-line bg-raised px-2.5 py-2 text-[13px] outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      {/* DEX filter tabs */}
      <div className="flex items-center gap-0.5 border-b border-line px-2 pb-1.5">
        {[{ dexId: "all", label: "All" }, ...MARKETS].map((m) => (
          <button
            key={m.dexId}
            onClick={() => setDexTab(m.dexId)}
            className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              dexTab === m.dexId ? "bg-raised text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* pasted-address lookup result */}
      {isAddr && (
        <div className="border-b border-line p-1 text-xs">
          {isFetching && <div className="px-2 py-1.5 text-muted">Looking up…</div>}
          {error && <div className="px-2 py-1.5 text-down">{(error as Error).message}</div>}
          {lookup && (
            <button
              onClick={() => select(lookup)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-raised"
            >
              <span className="flex items-center gap-2">
                <TokenAvatar symbol={lookup.token.symbol} />
                <span className="font-semibold">{lookup.token.symbol}</span>
                <span className="text-muted">{lookup.token.name}</span>
              </span>
              <span className="text-muted">
                {lookup.pool.market.label} · /{lookup.pool.quote.symbol} ·{" "}
                {lookup.pool.fee / 10_000}%
              </span>
            </button>
          )}
        </div>
      )}

      {/* volume-ranked market table */}
      <div className={`${grid} px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted`}>
        <span>Market</span>
        {(["price", "change", "volume", "liquidity"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => toggleSort(k)}
            className={`text-right hover:text-fg ${sort.key === k ? "text-fg" : ""}`}
          >
            {k === "change" ? "24h" : SORT_LABEL[k]}{" "}
            {sort.key === k ? (sort.dir === -1 ? "↓" : "↑") : "⇅"}
          </button>
        ))}
      </div>
      <div className="max-h-96 overflow-y-auto pb-1">
        {isLoading && <div className="px-2.5 py-2 text-xs text-muted">Loading markets…</div>}
        {rows.map((p) => {
          const chg = p.change24hPct;
          const market = MARKETS.find((m) => m.dexId === p.dexId);
          return (
            <button
              key={p.address}
              onClick={() => pickRow(p)}
              disabled={!!resolving}
              className={`${grid} w-full px-3 py-2 text-left text-[13px] hover:bg-raised disabled:opacity-60`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <TokenAvatar symbol={p.baseSymbol} />
                <span className="truncate font-semibold">
                  {p.baseSymbol}-{p.quoteSymbol}
                </span>
                <span className="rounded bg-raised px-1 text-[8px] font-medium uppercase text-muted">
                  {market?.label.split(" ")[0]}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {resolving === p.address ? "…" : p.priceUsd != null ? fmtUsd(p.priceUsd) : "—"}
              </span>
              <span
                className={`text-right tabular-nums ${chg == null ? "text-muted" : chg >= 0 ? "text-up" : "text-down"}`}
              >
                {chg != null ? fmtPct(chg) : "—"}
              </span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.volume24hUsd)}</span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.reserveUsd)}</span>
            </button>
          );
        })}
        {!isLoading && rows.length === 0 && !isAddr && (
          <div className="px-2.5 py-2 text-xs text-muted">
            No match — paste the token's 0x address to load it directly.
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line px-2.5 py-1 text-[10px] text-muted">
        <span>{rows.length} markets</span>
        <span>Sorted by {SORT_LABEL[sort.key]}</span>
      </div>
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
