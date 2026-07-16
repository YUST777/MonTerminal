import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { BRIDGE_CHAINS } from "../../config/wagmi.ts";
import { BRIDGE_TOKENS, isNative, type BridgeToken } from "../../config/tokens.ts";
import { fetchRelayTokens } from "../../lib/relay.ts";

export type BridgeChain = (typeof BRIDGE_CHAINS)[number];

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
  if (token.logo && !broken) {
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
  chain: BridgeChain;
  token: BridgeToken;
  onSelect: (chain: BridgeChain, token: BridgeToken) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeChain, setActiveChain] = useState<BridgeChain>(chain);

  // Live curated list from Relay; static registry fills in while loading.
  const { data: liveList } = useQuery({
    queryKey: ["relay-tokens", activeChain.id],
    queryFn: () => fetchRelayTokens(activeChain.id),
    staleTime: 5 * 60_000,
  });

  // Full-catalog search: any token Relay can bridge is findable by name.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searched } = useQuery({
    queryKey: ["relay-token-search", activeChain.id, debounced],
    queryFn: () => fetchRelayTokens(activeChain.id, debounced),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const tokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = liveList ?? BRIDGE_TOKENS[activeChain.id] ?? [];
    const local = base.filter(
      (t) =>
        !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    );
    if (q.length < 2 || !searched) return local;
    // merge remote catalog hits under the curated matches, deduped by address
    const seen = new Set(local.map((t) => t.address.toLowerCase()));
    return [...local, ...searched.filter((t) => !seen.has(t.address.toLowerCase()))];
  }, [activeChain.id, query, liveList, searched]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (
              document.getElementById("token-search") as HTMLInputElement | null
            )?.focus();
          }}
          className="animate-sheet-in fixed left-1/2 top-[16vh] z-50 w-[600px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-3xl border border-line bg-raised p-6 shadow-2xl outline-none"
        >
          <div className="mb-5 flex items-center gap-4">
            <Dialog.Title className="shrink-0 text-lg font-semibold">
              Select a token
            </Dialog.Title>
            <div className="flex flex-1 items-center gap-2.5 rounded-full bg-bg/60 px-4 py-2.5 ring-1 ring-line transition-shadow focus-within:ring-brand">
              <SearchGlyph />
              <input
                id="token-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tokens"
                spellCheck={false}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-overlay text-muted transition-colors hover:text-fg"
            >
              <CloseGlyph />
            </Dialog.Close>
          </div>

          {/* chain strip — pick the origin network */}
          <div className="mb-5 flex items-center gap-2">
            {BRIDGE_CHAINS.map((c) => (
              <button
                key={c.id}
                title={c.name}
                onClick={() => setActiveChain(c)}
                className={`flex items-center justify-center rounded-xl px-3.5 py-2.5 transition-all duration-150 active:scale-95 ${
                  activeChain.id === c.id
                    ? "bg-brand/15 ring-1 ring-brand"
                    : "bg-overlay/40 ring-1 ring-transparent hover:bg-overlay hover:ring-line"
                }`}
              >
                <ChainIcon chain={c} size="size-6" />
              </button>
            ))}
          </div>

          {/* token grid */}
          <div className="grid max-h-[380px] grid-cols-2 gap-2.5 overflow-y-auto">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TokenCard({
  chain,
  token,
  active,
  onPick,
}: {
  chain: BridgeChain;
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
      className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-150 active:scale-[0.98] ${
        active
          ? "bg-brand/15"
          : "bg-overlay/40 hover:bg-overlay"
      }`}
    >
      <TokenImg token={token} size="size-9" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-tight">{token.symbol}</span>
        <span className="truncate text-xs text-muted">{token.name}</span>
      </span>
      <span
        className={`shrink-0 text-sm tabular-nums ${active ? "text-fg" : "text-muted"}`}
      >
        {val != null ? val.toFixed(4) : ""}
      </span>
      {active && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-bg">
          <CheckGlyph />
        </span>
      )}
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
    <svg viewBox="0 0 16 16" className="size-3 shrink-0" fill="none" aria-hidden>
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
