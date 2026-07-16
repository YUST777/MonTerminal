import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useBurnerScan,
  useBurnExecute,
  useBurnFee,
  type BurnAction,
  type BurnerToken,
} from "../../hooks/burner.ts";
import { fmtUsd } from "../../lib/format.ts";
import { BurnSummary, SafetyBanner, WhyBurn } from "./BurnerRail.tsx";
import { NftGrid } from "./NftGrid.tsx";
import { SummaryTab } from "./SummaryTab.tsx";
import { TokenTable } from "./TokenTable.tsx";

type Tab = "tokens" | "nfts" | "summary";

const ACTIONS: {
  key: BurnAction;
  title: string;
  desc: string;
  sub: string;
  glyph: React.ReactNode;
}[] = [
  {
    key: "burn",
    title: "Burn Forever",
    desc: "Permanently burn spam tokens & NFTs.",
    sub: "Can't be undone.",
    glyph: <FlameGlyph className="size-4.5" />,
  },
  {
    key: "sell",
    title: "Sell for Value",
    desc: "Swap or sell dust for MON or stablecoins.",
    sub: "Best for small balances.",
    glyph: <DollarGlyph className="size-4.5" />,
  },
  {
    key: "convert",
    title: "Convert to USDC",
    desc: "Swap dust to USDC via aggregator.",
    sub: "Auto swap & send to wallet.",
    glyph: <SwapGlyph className="size-4.5" />,
  },
];

/**
 * Burner — scan the wallet for dust and spam, then burn, sell or convert it.
 * Every number is read live from Monad: token discovery from Transfer logs +
 * verified lists, prices from GeckoTerminal, fees from the live gas price.
 */
export function BurnerPage() {
  const { isConnected } = useAccount();
  const scan = useBurnerScan();
  const fee = useBurnFee();
  const exec = useBurnExecute();
  const [action, setAction] = useState<BurnAction>("burn");
  const [tab, setTab] = useState<Tab>("tokens");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tokens = scan.data?.tokens ?? [];
  const selectedTokens = useMemo(
    () => tokens.filter((t) => selected.has(t.address.toLowerCase())),
    [tokens, selected],
  );
  const selectedUsd = selectedTokens.reduce((s, t) => s + t.valueUsd, 0);

  const toggle = (t: BurnerToken) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const key = t.address.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const setMany = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const confirm = async () => {
    await exec.run(action, selectedTokens);
    setSelected(new Set());
  };

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <img src="/burn.webp" alt="" className="size-36 object-contain" />
        <div className="text-lg font-semibold">Connect a wallet to scan for dust</div>
        <div className="max-w-sm text-center text-xs text-muted">
          Everything is read live from Monad — spam tokens, dust balances and past burns.
        </div>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
            >
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4">
        {/* ---- top row: hero + choose an action ---- */}
        <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
          {/* hero: title · taglines · stats, trash illustration right */}
          <div className="relative overflow-hidden rounded-xl border border-line bg-raised/40 p-5">
            <div className="relative z-10 max-w-[60%]">
              <div className="flex items-center gap-2.5">
                <span className="text-[28px] font-bold leading-tight">Burner</span>
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <FlameGlyph className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-[14px] font-medium">
                Clean your wallet. Burn spam. Reclaim value.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Remove worthless tokens and NFTs cluttering your wallet. Convert dust to value
                or burn it forever.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <HeaderStat
                  label="Assets Scanned"
                  value={scan.data ? scan.data.scanned.toLocaleString("en-US") : null}
                  sub="Across Monad"
                />
                <HeaderStat
                  label="Estimated Reclaimable"
                  value={scan.data ? fmtUsd(scan.data.reclaimableUsd) : null}
                  sub="From dust & low value assets"
                />
              </div>
            </div>
            <img
              src="/burn.webp"
              alt="Burning trash can"
              className="absolute -right-4 top-1/2 hidden w-60 -translate-y-1/2 object-contain sm:block"
            />
            {/* soft glow behind the flame */}
            <div className="absolute -right-6 top-1/2 hidden size-52 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl sm:block" />
          </div>

          {/* choose an action — radio cards */}
          <div className="rounded-xl border border-line bg-raised/40 p-5">
            <div className="mb-3 text-[16px] font-semibold">Choose an action</div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {ACTIONS.map((a) => {
                const active = action === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => setAction(a.key)}
                    className={`relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors active:scale-[0.99] ${
                      active ? "border-brand bg-brand/10" : "border-line hover:border-muted/40"
                    }`}
                  >
                    {/* radio */}
                    <span
                      className={`absolute right-3 top-3 flex size-4 items-center justify-center rounded-full border ${
                        active ? "border-brand bg-brand" : "border-line"
                      }`}
                    >
                      {active && <span className="size-1.5 rounded-full bg-bg" />}
                    </span>
                    <span
                      className={`flex size-9 items-center justify-center rounded-lg ${
                        active ? "bg-brand text-bg" : "bg-overlay text-muted"
                      }`}
                    >
                      {a.glyph}
                    </span>
                    <span className="text-[13px] font-semibold">{a.title}</span>
                    <span className="text-[11px] leading-snug text-muted">{a.desc}</span>
                    <span className="text-[10px] text-muted/70">{a.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---- main row: table card + summary rail ---- */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="rounded-xl border border-line bg-raised/40">
              <div className="flex gap-1 border-b border-line px-3 pt-2.5">
                {(
                  [
                    ["tokens", "Tokens"],
                    ["nfts", "NFTs"],
                    ["summary", "Summary"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`rounded-t-md px-3 pb-2 pt-1 text-[13px] font-medium transition-colors ${
                      tab === key
                        ? "border-b-2 border-brand font-semibold text-fg"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "tokens" && (
                <TokenTable
                  tokens={tokens}
                  loading={scan.isLoading}
                  selected={selected}
                  selectedUsd={selectedUsd}
                  action={action}
                  busy={exec.busy}
                  progress={exec.progress}
                  onToggle={toggle}
                  onSetMany={setMany}
                  onRefresh={() => scan.refetch()}
                  onExecute={confirm}
                />
              )}
              {tab === "nfts" && <NftGrid />}
              {tab === "summary" && <SummaryTab />}
            </div>
            <SafetyBanner />
          </div>

          <div className="flex flex-col gap-3">
            <BurnSummary
              action={action}
              count={selectedTokens.length}
              valueUsd={selectedUsd}
              feeMon={fee.data != null ? fee.data * Math.max(1, selectedTokens.length) : null}
              monUsd={scan.data?.monUsd ?? null}
              busy={exec.busy}
              progress={exec.progress}
              onConfirm={confirm}
            />
            <WhyBurn />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub: string;
}) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-bg/50 px-3.5 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      {value == null ? (
        <span className="skeleton mt-1 block h-6 w-16 rounded" />
      ) : (
        <div className="text-xl font-bold tabular-nums">{value}</div>
      )}
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}

/* inline glyphs */

export function FlameGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path
        d="M10 2.5c.4 2.6-1.2 3.9-2.4 5.2C6.3 9 5.5 10.3 5.5 12a4.5 4.5 0 0 0 9 0c0-1.4-.6-2.5-1.3-3.5-.3 1-.9 1.6-1.7 2 .3-2.6-.4-6-1.5-8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DollarGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path d="M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M13.5 6.5c-.6-1-1.9-1.5-3.5-1.5-1.9 0-3.2 1-3.2 2.4 0 3.4 7 1.7 7 5.2 0 1.5-1.5 2.4-3.8 2.4-1.7 0-3-.6-3.7-1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SwapGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path
        d="M4 7h11m0 0-3-3m3 3-3 3M16 13H5m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
