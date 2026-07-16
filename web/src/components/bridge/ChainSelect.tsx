import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { BRIDGE_ORIGINS } from "../../config/wagmi.ts";
import { BRIDGE_TOKENS, isNative, type BridgeToken } from "../../config/tokens.ts";

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

export function TokenImg({
  token,
  size = "size-8",
}: {
  token: BridgeToken;
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!broken) {
    return (
      <img
        src={token.logo}
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
      {token.symbol.slice(0, 1)}
    </span>
  );
}

/**
 * Compact token picker — Uniswap-style: a chain strip on top switches the
 * origin network, below it every bridgeable token on that chain in a
 * 2-col card grid with live balances.
 */
export function TokenSelectModal({
  chain,
  token,
  onSelect,
  onClose,
}: {
  chain: Origin;
  token: BridgeToken;
  onSelect: (chain: Origin, token: BridgeToken) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeChain, setActiveChain] = useState<Origin>(chain);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (BRIDGE_TOKENS[activeChain.id] ?? []).filter(
      (t) =>
        !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    );
  }, [activeChain.id, query]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[16vh]"
      onClick={onClose}
    >
      <div
        className="w-[920px] max-w-[calc(100vw-2rem)] rounded-[28px] border border-line bg-raised p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-7 flex items-center gap-6">
          <span className="shrink-0 text-2xl font-semibold">Select a token</span>
          <div className="flex flex-1 items-center gap-3 rounded-full bg-bg/60 px-5 py-3 ring-1 ring-line focus-within:ring-brand">
            <SearchGlyph />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tokens"
              spellCheck={false}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-overlay text-muted transition-colors hover:text-fg"
          >
            <CloseGlyph />
          </button>
        </div>

        {/* chain strip — pick the origin network */}
        <div className="mb-7 flex items-center gap-3">
          {BRIDGE_ORIGINS.map((c) => (
            <button
              key={c.id}
              title={c.name}
              onClick={() => setActiveChain(c)}
              className={`flex items-center justify-center rounded-2xl px-5 py-3.5 transition-colors ${
                activeChain.id === c.id
                  ? "bg-brand/10 ring-1 ring-brand/70"
                  : "bg-overlay/40 ring-1 ring-transparent hover:bg-overlay hover:ring-line"
              }`}
            >
              <ChainIcon chain={c} size="size-8" />
            </button>
          ))}
          <span className="ml-auto flex flex-col items-center gap-1.5">
            <span className="truncate text-base font-medium">{activeChain.name}</span>
            <span className="h-0.5 w-7 rounded-full bg-brand" />
          </span>
        </div>

        {/* token grid */}
        <div className="grid max-h-[440px] grid-cols-2 gap-4 overflow-y-auto">
          {tokens.map((t) => (
            <TokenCard
              key={t.address + t.symbol}
              chain={activeChain}
              token={t}
              active={activeChain.id === chain.id && t.address === token.address}
              onPick={() => onSelect(activeChain, t)}
            />
          ))}
        </div>
        {tokens.length === 0 && (
          <div className="py-4 text-center text-sm text-muted">
            No token matches "{query}"
          </div>
        )}
      </div>
    </div>
  );
}

function TokenCard({
  chain,
  token,
  active,
  onPick,
}: {
  chain: Origin;
  token: BridgeToken;
  active: boolean;
  onPick: () => void;
}) {
  const { address } = useAccount();
  const { data: balance } = useBalance({
    address,
    chainId: chain.id,
    token: isNative(token) ? undefined : token.address,
  });
  const val = balance ? Number(formatUnits(balance.value, balance.decimals)) : null;

  return (
    <button
      onClick={onPick}
      className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-colors ${
        active
          ? "bg-brand/5 ring-1 ring-brand/70"
          : "bg-overlay/40 ring-1 ring-transparent hover:bg-overlay hover:ring-line"
      }`}
    >
      <TokenImg token={token} size="size-12" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xl font-semibold leading-tight">{token.symbol}</span>
        <span className="truncate text-sm text-muted">{token.name}</span>
      </span>
      <span className="shrink-0 text-lg tabular-nums text-muted">
        {val != null ? val.toFixed(4) : ""}
      </span>
      {active && <CheckGlyph />}
    </button>
  );
}

/* glyphs */

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 shrink-0 text-muted" fill="none" aria-hidden>
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
    <svg viewBox="0 0 16 16" className="size-6 shrink-0 text-brand" fill="none" aria-hidden>
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
