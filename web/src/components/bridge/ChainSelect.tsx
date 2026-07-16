import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { BRIDGE_ORIGINS } from "../../config/wagmi.ts";

export type Origin = (typeof BRIDGE_ORIGINS)[number];

/** DefiLlama's public chain-icon CDN — plain <img>, no key needed. */
const ICON_SLUG: Record<string, string> = {
  Ethereum: "ethereum",
  Base: "base",
  "Arbitrum One": "arbitrum",
  "OP Mainnet": "optimism",
  "BNB Smart Chain": "binance",
  Polygon: "polygon",
  Monad: "monad",
};

export function ChainIcon({
  chain,
  size = "size-6",
}: {
  chain: { name: string };
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  const slug = ICON_SLUG[chain.name];
  if (slug && !broken) {
    return (
      <img
        src={`https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`}
      />
    );
  }
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-overlay text-[10px] font-bold text-brand ring-1 ring-line`}
    >
      {chain.name.slice(0, 1)}
    </span>
  );
}

/**
 * Uniswap-style "select a token" sheet, scoped to bridge origins: search,
 * quick-pick chips for the majors, then rows with your live native balance
 * on each chain.
 */
export function ChainSelectModal({
  selected,
  onSelect,
  onClose,
}: {
  selected: Origin;
  onSelect: (c: Origin) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  // Esc closes, like every uniswap modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BRIDGE_ORIGINS.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.nativeCurrency.symbol.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[400px] flex-col rounded-2xl border border-line bg-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-base font-semibold">Select a network</span>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
            <CloseGlyph />
          </button>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5 focus-within:border-brand">
            <SearchGlyph />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search networks"
              spellCheck={false}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
        </div>

        {/* quick-pick chips */}
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {BRIDGE_ORIGINS.slice(0, 4).map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 transition-colors ${
                selected.id === c.id
                  ? "bg-brand/15 text-brand ring-brand/40"
                  : "bg-overlay ring-line hover:ring-brand"
              }`}
            >
              <ChainIcon chain={c} size="size-5" />
              {c.nativeCurrency.symbol}
            </button>
          ))}
        </div>

        <div className="px-4 pb-1 pt-2 text-xs font-medium text-muted">Your gas balances</div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {rows.map((c) => (
            <ChainRow key={c.id} chain={c} active={selected.id === c.id} onPick={() => onSelect(c)} />
          ))}
          {rows.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted">No network matches "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChainRow({
  chain,
  active,
  onPick,
}: {
  chain: Origin;
  active: boolean;
  onPick: () => void;
}) {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address, chainId: chain.id });
  const val = balance ? Number(formatUnits(balance.value, balance.decimals)) : null;

  return (
    <button
      onClick={onPick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-overlay ${
        active ? "bg-overlay/60" : ""
      }`}
    >
      <ChainIcon chain={chain} size="size-8" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{chain.name}</span>
        <span className="text-xs text-muted">{chain.nativeCurrency.symbol}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-sm tabular-nums">
          {val != null ? val.toFixed(4) : address ? "…" : "—"}
        </span>
        {active && <span className="text-[10px] font-medium text-brand">selected</span>}
      </span>
    </button>
  );
}

/* glyphs */

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-muted" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path d="m3.5 3.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
