import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { BRIDGE_CHAINS } from "../../config/wagmi.ts";
import { BRIDGE_TOKENS, isNative, nativeFromChain, type BridgeToken } from "../../config/tokens.ts";
import { fetchRelayTokens } from "../../lib/relay.ts";

export type BridgeChain = (typeof BRIDGE_CHAINS)[number];

/**
 * Chain logos straight from Relay's asset CDN — one URL pattern covers every
 * chain they bridge, keyed by chain id. Monad keeps the TrustWallet mark for
 * quality (Relay's thumbnail is low-res).
 */
const LOGO_URL: Record<number, string> = {
  143: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png",
};

/** wagmi/chains ships verbose canonical names — trim them for the UI. */
const SHORT_NAME: Record<string, string> = {
  "BNB Smart Chain": "BNB Chain",
  "Arbitrum One": "Arbitrum",
  "OP Mainnet": "Optimism",
};
const chainLabel = (c: { name: string }) => SHORT_NAME[c.name] ?? c.name;

export function ChainIcon({
  chain,
  size = "size-6",
}: {
  chain: { id: number; name: string };
  size?: string;
}) {
  // Track which URL 404'd, not a bare boolean — the same slot re-renders with
  // a different chain (TokenButton badge, rail), and a stale flag would stick.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url =
    LOGO_URL[chain.id] ?? `https://assets.relay.link/icons/${chain.id}/light.png`;
  if (brokenUrl !== url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBrokenUrl(url)}
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
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (token.logo && brokenUrl !== token.logo) {
    return (
      <img
        src={token.logo}
        alt=""
        loading="lazy"
        onError={() => setBrokenUrl(token.logo)}
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
 * Token picker, Relay-style two-pane: a searchable chain rail on the left
 * (names, not a wall of anonymous icons) switches the origin network; the
 * right pane lists every bridgeable token on that chain with live balances.
 * On phones the rail collapses into a horizontal chain strip.
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
  const [chainQuery, setChainQuery] = useState("");
  const [activeChain, setActiveChain] = useState<BridgeChain>(chain);

  const chains = useMemo(() => {
    const q = chainQuery.trim().toLowerCase();
    if (!q) return BRIDGE_CHAINS;
    return BRIDGE_CHAINS.filter((c) => chainLabel(c).toLowerCase().includes(q));
  }, [chainQuery]);

  // Live curated list from Relay; static registry fills in while loading.
  const { data: liveList } = useQuery({
    queryKey: ["relay-tokens", activeChain.id],
    queryFn: () => fetchRelayTokens(activeChain.id),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Full-catalog search: any token Relay can bridge is findable by name.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const {
    data: searched,
    isFetching: searchLoading,
    isError: searchFailed,
  } = useQuery({
    queryKey: ["relay-token-search", activeChain.id, debounced],
    queryFn: () => fetchRelayTokens(activeChain.id, debounced),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const searching =
    query.trim().length >= 2 && (searchLoading || debounced !== query.trim());

  const tokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    // static registry (or the bare native token) fills in while Relay loads
    const base =
      liveList ?? BRIDGE_TOKENS[activeChain.id] ?? [nativeFromChain(activeChain)];
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
          className="animate-sheet-in fixed left-1/2 top-[6vh] z-50 flex h-[80vh] max-h-[620px] w-[760px] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-raised shadow-2xl outline-none sm:top-[10vh]"
        >
          <Dialog.Title className="sr-only">Select a token</Dialog.Title>

          {/* chain rail — every EVM origin Relay bridges from, majors pinned first */}
          <aside className="hidden w-[212px] shrink-0 flex-col border-r border-line bg-bg/40 sm:flex">
            <div className="p-3 pb-2">
              <div className="flex items-center gap-2 rounded-full bg-overlay/60 px-3 py-2 ring-1 ring-line transition-shadow focus-within:ring-brand">
                <SearchGlyph />
                <input
                  value={chainQuery}
                  onChange={(e) => setChainQuery(e.target.value)}
                  placeholder="Search chains"
                  spellCheck={false}
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
                />
              </div>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent]">
              {chains.map((c) => {
                const active = activeChain.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChain(c)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-brand/15 text-fg"
                        : "text-muted hover:bg-overlay hover:text-fg"
                    }`}
                  >
                    <ChainIcon chain={c} size="size-5" />
                    <span className="truncate">{chainLabel(c)}</span>
                    {active && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-brand" />
                    )}
                  </button>
                );
              })}
              {chains.length === 0 && (
                <div className="px-2.5 py-4 text-center text-xs text-muted">
                  No chain matches "{chainQuery}"
                </div>
              )}
            </div>
          </aside>

          {/* token pane */}
          <section className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-3 sm:mb-4">
              <div className="flex flex-1 items-center gap-2.5 rounded-full bg-bg/60 px-4 py-2.5 ring-1 ring-line transition-shadow focus-within:ring-brand">
                <SearchGlyph />
                <input
                  id="token-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search tokens on ${chainLabel(activeChain)}`}
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

            {/* phone fallback: the rail collapses into a horizontal chain strip */}
            <div className="mb-3 flex items-center gap-2 overflow-x-auto sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {BRIDGE_CHAINS.map((c) => {
                const active = activeChain.id === c.id;
                return (
                  <button
                    key={c.id}
                    title={chainLabel(c)}
                    onClick={() => setActiveChain(c)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150 active:scale-95 ${
                      active
                        ? "bg-brand/15"
                        : "bg-overlay/40 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <ChainIcon chain={c} size="size-5" />
                    {active && (
                      <span className="whitespace-nowrap text-[13px] font-semibold">
                        {chainLabel(c)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent]">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
              {tokens.length === 0 &&
                (searching ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
                    <Spinner /> Searching the catalog…
                  </div>
                ) : searchFailed ? (
                  <div className="py-6 text-center text-sm text-muted">
                    Search is unreachable right now — check your connection and try
                    again.
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted">
                    No token matches "{query}"
                  </div>
                ))}
              {tokens.length > 0 && searching && (
                <div className="flex items-center justify-center gap-2 pt-3 text-xs text-muted">
                  <Spinner /> Searching the catalog…
                </div>
              )}
            </div>
          </section>
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

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 animate-spin text-brand" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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
