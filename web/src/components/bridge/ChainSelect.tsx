import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { BRIDGE_ORIGINS } from "../../config/wagmi.ts";

export type Origin = (typeof BRIDGE_ORIGINS)[number];

/**
 * High-quality official chain logos from the TrustWallet assets repo
 * (github.com/trustwallet/assets) — plain raw.githubusercontent URLs.
 */
const LOGO_SLUG: Record<string, string> = {
  Ethereum: "ethereum",
  Base: "base",
  "Arbitrum One": "arbitrum",
  "OP Mainnet": "optimism",
  "BNB Smart Chain": "smartchain",
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
  const slug = LOGO_SLUG[chain.name];
  if (slug && !broken) {
    return (
      <img
        src={`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/info/logo.png`}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${size} shrink-0 rounded-full object-cover`}
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
 * Network picker — wide, height-hugging sheet with a 2-column grid of chain
 * cards (logo · name · your gas balance), apple-clean rounded corners.
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
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[16vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[calc(100vw-2rem)] rounded-3xl border border-line bg-raised p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-4">
          <span className="shrink-0 text-base font-semibold">Select a network</span>
          {/* search inline with the title — keeps the sheet short */}
          <div className="flex flex-1 items-center gap-2 rounded-full bg-bg/60 px-3.5 py-2 ring-1 ring-line focus-within:ring-brand">
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-overlay text-muted transition-colors hover:text-fg"
          >
            <CloseGlyph />
          </button>
        </div>

        {/* 2-col card grid — same mock layout, compact */}
        <div className="grid grid-cols-2 gap-3">
          {rows.map((c) => (
            <ChainCard
              key={c.id}
              chain={c}
              active={selected.id === c.id}
              onPick={() => onSelect(c)}
            />
          ))}
        </div>
        {rows.length === 0 && (
          <div className="py-3 text-center text-xs text-muted">
            No network matches "{query}"
          </div>
        )}
      </div>
    </div>
  );
}

function ChainCard({
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
      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ${
        active
          ? "bg-brand/5 ring-1 ring-brand/70"
          : "bg-overlay/40 ring-1 ring-transparent hover:bg-overlay hover:ring-line"
      }`}
    >
      <ChainIcon chain={chain} size="size-9" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold leading-tight">{chain.name}</span>
        <span className="text-xs tabular-nums text-muted">
          {val != null
            ? `${val.toFixed(4)} ${chain.nativeCurrency.symbol}`
            : chain.nativeCurrency.symbol}
        </span>
      </span>
      {active && <CheckGlyph />}
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

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-brand" fill="none" aria-hidden>
      <path
        d="m3 8.5 3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
