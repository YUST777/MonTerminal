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
import { BurnerRail } from "./BurnerRail.tsx";
import { NftGrid } from "./NftGrid.tsx";
import { SummaryTab } from "./SummaryTab.tsx";
import { TokenTable } from "./TokenTable.tsx";

type Tab = "tokens" | "nfts" | "summary";

const ACTIONS: { key: BurnAction; title: string; desc: string; glyph: React.ReactNode }[] = [
  {
    key: "burn",
    title: "Burn Forever",
    desc: "Send to the dead address — irreversible",
    glyph: <FlameGlyph className="size-5" />,
  },
  {
    key: "sell",
    title: "Sell for Value",
    desc: "Swap dust into MON via Relay",
    glyph: <DollarGlyph className="size-5" />,
  },
  {
    key: "convert",
    title: "Convert to USDC",
    desc: "Consolidate into stable value",
    glyph: <SwapGlyph className="size-5" />,
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
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
        {/* ---- left column ---- */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* header: title + tagline + burning trash, stats underneath */}
          <div className="overflow-hidden rounded-xl border border-line bg-raised/40 p-5">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-[26px] font-bold leading-tight">Burner</span>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-brand/15 text-brand">
                    <FlameGlyph className="size-4" />
                  </span>
                </div>
                <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
                  Clean up your wallet. Burn dust, spam and worthless tokens — or squeeze the
                  last drop of value out of them.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <HeaderStat
                    label="Assets Scanned"
                    value={scan.data ? String(scan.data.scanned) : null}
                    sub="Across Monad"
                  />
                  <HeaderStat
                    label="Estimated Reclaimable"
                    value={scan.data ? fmtUsd(scan.data.reclaimableUsd) : null}
                    sub="From dust & low value assets"
                    tone="brand"
                  />
                </div>
              </div>
              <img
                src="/burn.webp"
                alt="Burning trash can"
                className="-my-8 -mr-6 hidden size-44 shrink-0 object-contain sm:block md:size-52"
              />
            </div>
          </div>

          {/* choose an action */}
          <div className="rounded-xl border border-line bg-raised/40 p-4">
            <div className="mb-3 text-[15px] font-semibold">Choose an action</div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {ACTIONS.map((a) => {
                const active = action === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => setAction(a.key)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors active:scale-[0.99] ${
                      active
                        ? "border-brand bg-brand/10"
                        : "border-line hover:border-muted/40"
                    }`}
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-lg ${
                        active ? "bg-brand text-bg" : "bg-overlay text-muted"
                      }`}
                    >
                      {a.glyph}
                    </span>
                    <span className="text-[13px] font-semibold">{a.title}</span>
                    <span className="text-[11px] leading-snug text-muted">{a.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* tabs + tab body */}
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
        </div>

        {/* ---- right rail ---- */}
        <div className="w-full shrink-0 lg:w-[330px]">
          <BurnerRail
            action={action}
            count={selectedTokens.length}
            valueUsd={selectedUsd}
            feeMon={fee.data != null ? fee.data * Math.max(1, selectedTokens.length) : null}
            monUsd={scan.data?.monUsd ?? null}
            busy={exec.busy}
            progress={exec.progress}
            onConfirm={confirm}
          />
        </div>
      </div>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | null;
  sub: string;
  tone?: "brand";
}) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-bg/50 px-3.5 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      {value == null ? (
        <span className="skeleton mt-1 block h-6 w-16 rounded" />
      ) : (
        <div
          className={`text-xl font-bold tabular-nums ${tone === "brand" ? "text-brand" : ""}`}
        >
          {value}
        </div>
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
