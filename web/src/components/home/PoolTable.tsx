import { useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress, type Address } from "viem";
import { MARKETS, monad } from "@monolimit/shared";
import { lookupTokenCached, lookupTopPool, useOnchainIcons, usePairsMedia } from "../../hooks/market.ts";
import type { TopPool } from "../../lib/gecko.ts";
import { fmtAge, fmtAmountNum, fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { TokenIcon } from "../TokenIcon.tsx";
import { useToasts } from "../Toasts.tsx";

const GRID =
  "grid grid-cols-[minmax(180px,2.4fr)_0.7fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.7fr] items-center gap-2";

/** GMGN-style dense token table: click a row to open it in the terminal. */
export function PoolTable({ pools, loading }: { pools: TopPool[] | undefined; loading: boolean }) {
  const client = usePublicClient({ chainId: monad.id });
  const setMarket = useTerminal((s) => s.setMarket);
  const setDetectedToken = useTerminal((s) => s.setDetectedToken);
  const push = useToasts((s) => s.push);
  const [resolving, setResolving] = useState<string | null>(null);
  // DexScreener icons fill the gaps in gecko's base_token sideload;
  // brand-new launchpad tokens resolve via on-chain getTokenInfo()
  const { data: media } = usePairsMedia(pools?.map((p) => p.address));
  const { data: chainIcons } = useOnchainIcons(pools?.map((p) => p.baseToken));

  const pick = async (p: TopPool) => {
    if (!client || resolving) return;
    setResolving(p.address);
    try {
      if (!isAddress(p.baseToken)) throw new Error("This discovery row has an invalid token address");
      // Known supported rows can open their exact pool immediately. Rows from
      // another DEX are resolved by token so supported fallback pools still
      // open, while genuinely unsupported tokens become view-only pages.
      if (MARKETS.some((m) => m.dexId === p.dexId)) {
        const r = await lookupTopPool(client, p);
        setMarket(r.token, r.pool);
      } else {
        const r = await lookupTokenCached(client, p.baseToken as Address);
        if (r.pool) setMarket(r.token, r.pool);
        else setDetectedToken(r.token, r.marketNotice ?? "No supported trading pool found");
      }
    } catch (err) {
      push("error", (err as Error).message.slice(0, 140));
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-raised/40">
      {/* Compact market cards keep the useful scan data visible without sideways scrolling. */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:hidden">
        {loading && !pools && <MobileSkeletonRows />}
        {!loading && (pools?.length ?? 0) === 0 && (
          <div className="px-3 py-5 text-xs text-muted">
            No pools indexed yet — paste a token address in the market selector above.
          </div>
        )}
        {(pools ?? []).map((p) => {
          const market = MARKETS.find((m) => m.dexId === p.dexId);
          const busy = resolving === p.address;
          const icon =
            media?.get(p.address.toLowerCase()) ??
            p.imageUrl ??
            chainIcons?.get(p.baseToken.toLowerCase());
          return (
            <button
              key={p.address}
              onClick={() => pick(p)}
              disabled={!!resolving}
              className="w-full border-b border-line/50 px-3 py-3 text-left transition-colors last:border-b-0 active:bg-overlay/70 disabled:opacity-60"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TokenIcon url={icon} symbol={p.baseSymbol} size="size-9" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{p.baseSymbol}</span>
                      <span className="shrink-0 text-[11px] text-muted">/{p.quoteSymbol}</span>
                      {busy && <span className="spinner size-3 shrink-0" />}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted">
                      <span className="truncate">{shortAddr(p.baseToken)}</span>
                      <span className="shrink-0 rounded bg-overlay px-1 py-px text-[8px] font-medium uppercase">
                        {sourceDexLabel(p.dexId, market)}
                      </span>
                      <span className="shrink-0">· {p.createdAtSec != null ? fmtAge(p.createdAtSec) : "—"}</span>
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold tabular-nums">
                    {p.priceUsd != null ? fmtUsd(p.priceUsd) : "—"}
                  </span>
                  <span className={`text-[11px] font-medium tabular-nums ${
                    p.change24hPct == null ? "text-muted" : p.change24hPct >= 0 ? "text-up" : "text-down"
                  }`}>
                    {p.change24hPct != null ? `${fmtPct(p.change24hPct)} 24h` : "— 24h"}
                  </span>
                </span>
              </span>
              <span className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-bg/55 px-2.5 py-2">
                <MobileMetric label="5m" value={p.change5mPct != null ? fmtPct(p.change5mPct) : "—"} tone={p.change5mPct} />
                <MobileMetric label="1h" value={p.change1hPct != null ? fmtPct(p.change1hPct) : "—"} tone={p.change1hPct} />
                <MobileMetric label="Volume" value={fmtUsd(p.volume24hUsd)} />
                <MobileMetric label="Liquidity" value={fmtUsd(p.reserveUsd)} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Full terminal table remains dense and sortable on tablet/desktop widths. */}
      <div className="hidden min-h-0 min-w-[880px] flex-1 flex-col lg:flex">
      <div
        className={`${GRID} border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted`}
      >
        <span>Token</span>
        <span className="text-right">Age</span>
        <span className="text-right">Price</span>
        <span className="text-right">5m</span>
        <span className="text-right">1h</span>
        <span className="text-right">24h</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Liq</span>
        <span className="text-right">MC</span>
        <span className="text-right">Txs</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !pools && <SkeletonRows />}
        {!loading && (pools?.length ?? 0) === 0 && (
          <div className="px-3 py-4 text-xs text-muted">
            No pools indexed yet — paste a token address in the market selector above.
          </div>
        )}
        {(pools ?? []).map((p) => {
          const market = MARKETS.find((m) => m.dexId === p.dexId);
          const busy = resolving === p.address;
          return (
            <button
              key={p.address}
              onClick={() => pick(p)}
              disabled={!!resolving}
              className={`${GRID} w-full border-b border-line/40 px-3 py-2 text-left text-[13px] transition-colors hover:bg-raised disabled:opacity-60`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <TokenIcon
                  url={
                    media?.get(p.address.toLowerCase()) ??
                    p.imageUrl ??
                    chainIcons?.get(p.baseToken.toLowerCase())
                  }
                  symbol={p.baseSymbol}
                  size="size-7"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{p.baseSymbol}</span>
                    <span className="truncate text-[11px] text-muted">/{p.quoteSymbol}</span>
                    {busy && <span className="spinner size-3 shrink-0" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span>{shortAddr(p.baseToken)}</span>
                    <span className="rounded bg-overlay px-1 py-px text-[8px] font-medium uppercase">
                      {sourceDexLabel(p.dexId, market)}
                    </span>
                  </span>
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-muted">
                {p.createdAtSec != null ? fmtAge(p.createdAtSec) : "—"}
              </span>
              <span className="text-right tabular-nums">
                {p.priceUsd != null ? fmtUsd(p.priceUsd) : "—"}
              </span>
              <PctCell v={p.change5mPct} />
              <PctCell v={p.change1hPct} />
              <PctCell v={p.change24hPct} />
              <span className="text-right tabular-nums">{fmtUsd(p.volume24hUsd)}</span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.reserveUsd)}</span>
              <span className="text-right tabular-nums text-muted">
                {p.fdvUsd != null ? fmtUsd(p.fdvUsd) : "—"}
              </span>
              <span className="text-right tabular-nums text-muted">
                {p.txns24h != null ? fmtAmountNum(p.txns24h, 0) : "—"}
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function MobileMetric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`truncate text-[11px] font-medium tabular-nums ${
        tone == null ? "text-fg" : tone >= 0 ? "text-up" : "text-down"
      }`}>
        {value}
      </span>
    </span>
  );
}

function PctCell({ v }: { v: number | null }) {
  return (
    <span
      className={`text-right text-xs font-medium tabular-nums ${
        v == null ? "text-muted" : v >= 0 ? "text-up" : "text-down"
      }`}
    >
      {v != null ? fmtPct(v) : "—"}
    </span>
  );
}

function sourceDexLabel(dexId: string, market: (typeof MARKETS)[number] | undefined) {
  return market?.label ?? (dexId.replace(/-monad$/, "").replace(/-/g, " ") || "Unknown DEX");
}

/** Shimmer placeholder rows shown only on first (uncached) load. */
function SkeletonRows({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${GRID} border-b border-line/40 px-3 py-2`}>
          <span className="flex items-center gap-2.5">
            <span className="skeleton size-7 shrink-0 rounded-full" />
            <span className="flex flex-col gap-1">
              <span className="skeleton h-3 w-24 rounded" />
              <span className="skeleton h-2 w-16 rounded" />
            </span>
          </span>
          {Array.from({ length: 9 }, (_, j) => (
            <span key={j} className="flex justify-end">
              <span className="skeleton h-3 w-10 rounded" />
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

function MobileSkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border-b border-line/40 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="skeleton size-9 rounded-full" />
              <span className="flex flex-col gap-1.5">
                <span className="skeleton h-3.5 w-24 rounded" />
                <span className="skeleton h-2.5 w-28 rounded" />
              </span>
            </span>
            <span className="flex flex-col items-end gap-1.5">
              <span className="skeleton h-3.5 w-16 rounded" />
              <span className="skeleton h-2.5 w-12 rounded" />
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-bg/55 px-2.5 py-2">
            {Array.from({ length: 4 }, (_, j) => <span key={j} className="skeleton h-7 rounded" />)}
          </div>
        </div>
      ))}
    </>
  );
}
