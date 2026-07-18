import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOhlcv } from "../../lib/gecko.ts";
import { fmtAmountNum, fmtPct, fmtUsd } from "../../lib/format.ts";
import type { PortfolioAsset } from "../../hooks/portfolio.ts";
import { TokenIcon } from "../TokenIcon.tsx";
import { usePersistentState } from "../../lib/persist.ts";

const GRID =
  "grid grid-cols-[minmax(170px,1.8fr)_0.9fr_1fr_1fr_minmax(150px,1.3fr)_minmax(130px,1.2fr)] items-center gap-3";
/** OHLCV is one gecko call per row — cap it well inside the free rate limit. */
const MAX_SPARKLINES = 8;
const COLLAPSED_ROWS = 6;

/** "Your Assets" — real balances only, allocation bars against the USD total. */
export function AssetsTable({
  assets,
  totalUsd,
  loading,
  hidden,
}: {
  assets: PortfolioAsset[];
  totalUsd: number;
  loading: boolean;
  hidden: boolean;
}) {
  const [unit, setUnit] = usePersistentState<"$" | "%">("assets-unit", "$", (v) => v === "$" || v === "%");
  const [expanded, setExpanded] = usePersistentState<boolean>("assets-expanded", false);
  const rows = expanded ? assets : assets.slice(0, COLLAPSED_ROWS);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-raised/40">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <span className="text-[15px] font-semibold">Your Assets</span>
        <div className="flex overflow-hidden rounded-md border border-line text-[11px] font-semibold">
          {(["$", "%"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 ${unit === u ? "bg-overlay text-fg" : "text-muted hover:text-fg"}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="lg:hidden">
        {loading && <MobileSkeletonRows />}
        {!loading && assets.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted">
            No tokens found in this wallet on Monad — bridge something in to get started.
          </div>
        )}
        {rows.map((a) => {
          const pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
          const up = (a.change24hPct ?? 0) >= 0;
          return (
            <div key={a.address ?? "native"} className="border-b border-line/40 px-3 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TokenIcon url={a.logo} symbol={a.symbol} size="size-9" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{a.name}</span>
                    <span className="truncate text-[11px] text-muted">{a.symbol}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums">
                    {a.priceUsd == null ? "—" : hidden ? "•••" : unit === "$" ? fmtUsd(a.valueUsd) : `${pct.toFixed(1)}%`}
                  </span>
                  <span className={`text-[11px] font-medium tabular-nums ${
                    a.change24hPct == null ? "text-muted" : up ? "text-up" : "text-down"
                  }`}>
                    {a.change24hPct != null ? `${fmtPct(a.change24hPct)} 24h` : "— 24h"}
                  </span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-bg/55 px-3 py-2.5">
                <AssetMetric label="Balance" value={hidden ? "•••" : fmtAmountNum(a.amount)} />
                <AssetMetric label="Price" value={a.priceUsd != null ? fmtUsd(a.priceUsd) : "—"} />
                <AssetMetric label="Allocation" value={`${pct.toFixed(1)}%`} />
                <span className="col-span-3 h-1 overflow-hidden rounded-full bg-overlay">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dense six-column table for tablet and desktop widths. */}
      <div className="hidden overflow-x-auto lg:block">
      <div className="min-w-[820px]">
      <div
        className={`${GRID} border-b border-line px-4 py-2 text-[11px] font-medium text-muted`}
      >
        <span>Asset</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span>24h Change</span>
        <span>Allocation</span>
      </div>
      {loading && <SkeletonRows />}
      {!loading && assets.length === 0 && (
        <div className="px-4 py-6 text-xs text-muted">
          No tokens found in this wallet on Monad — bridge something in to get started.
        </div>
      )}
      {rows.map((a, i) => {
        const pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
        const up = (a.change24hPct ?? 0) >= 0;
        return (
          <div
            key={a.address ?? "native"}
            className={`${GRID} border-b border-line/40 px-4 py-3 text-[13px] last:border-b-0`}
          >
            {/* asset: name over symbol, like the reference */}
            <span className="flex min-w-0 items-center gap-3">
              <TokenIcon url={a.logo} symbol={a.symbol} size="size-9" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold">{a.name}</span>
                <span className="truncate text-[11px] text-muted">{a.symbol}</span>
              </span>
            </span>
            <span className="text-right tabular-nums">
              {hidden ? "•••" : fmtAmountNum(a.amount)}
            </span>
            {/* price with its 24h move underneath */}
            <span className="flex flex-col items-end">
              <span className="tabular-nums">{a.priceUsd != null ? fmtUsd(a.priceUsd) : "—"}</span>
              {a.change24hPct != null && (
                <span className={`text-[11px] tabular-nums ${up ? "text-up" : "text-down"}`}>
                  {fmtPct(a.change24hPct)}
                </span>
              )}
            </span>
            <span className="text-right font-medium tabular-nums">
              {a.priceUsd == null
                ? "—"
                : hidden
                  ? "•••"
                  : unit === "$"
                    ? fmtUsd(a.valueUsd)
                    : `${pct.toFixed(1)}%`}
            </span>
            {/* 24h change: sparkline · dot · pct */}
            <span className="flex items-center gap-2.5">
              {a.pool && i < MAX_SPARKLINES ? (
                <Sparkline pool={a.pool} up={up} />
              ) : (
                <span className="w-16" />
              )}
              <span
                className={`flex items-center gap-1.5 text-xs font-medium tabular-nums ${
                  a.change24hPct == null ? "text-muted" : up ? "text-up" : "text-down"
                }`}
              >
                {a.change24hPct != null && (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
                {a.change24hPct != null ? fmtPct(a.change24hPct) : "—"}
              </span>
            </span>
            {/* allocation: pct over a slim bar */}
            <span className="flex flex-col gap-1.5 pr-2">
              <span className="text-xs tabular-nums">{pct.toFixed(1)}%</span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-overlay">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </span>
            </span>
          </div>
        );
      })}
      </div>
      </div>
      {!loading && assets.length > COLLAPSED_ROWS && (
        <div className="flex justify-center border-t border-line/40 py-2.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-brand hover:text-fg"
          >
            {expanded ? "Show Less" : `View All Assets (${assets.length})`}
            <span className={`text-[9px] transition-transform ${expanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** 24h close-price line from the asset's deepest pool (real OHLCV, no mock). */
export function Sparkline({
  pool,
  up,
  className = "h-5 w-16",
}: {
  pool: string;
  up: boolean;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["spark", pool],
    staleTime: 600_000, // one fetch per pool per 10 min is plenty for a 24h line
    retry: 0,
    queryFn: () => fetchOhlcv(pool, "1h", 24),
  });
  if (!data || data.length < 2) return <span className={className} />;
  const closes = data.map((c) => c.close);
  const min = Math.min(...closes);
  const range = Math.max(...closes) - min || 1;
  const pts = closes
    .map(
      (c, i) =>
        `${((i / (closes.length - 1)) * 58 + 1).toFixed(1)},${(16 - ((c - min) / range) * 13).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 60 18"
      className={`${className} shrink-0 ${up ? "text-up" : "text-down"}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${GRID} border-b border-line/40 px-4 py-3`}>
          <span className="flex items-center gap-3">
            <span className="skeleton size-9 shrink-0 rounded-full" />
            <span className="flex flex-col gap-1">
              <span className="skeleton h-3 w-24 rounded" />
              <span className="skeleton h-2 w-12 rounded" />
            </span>
          </span>
          {Array.from({ length: 5 }, (_, j) => (
            <span key={j} className="flex justify-end">
              <span className="skeleton h-3 w-12 rounded" />
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

function AssetMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
      <span className="truncate text-[11px] font-medium tabular-nums">{value}</span>
    </span>
  );
}

function MobileSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border-b border-line/40 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="skeleton size-9 rounded-full" />
              <span className="flex flex-col gap-1.5">
                <span className="skeleton h-3.5 w-24 rounded" />
                <span className="skeleton h-2.5 w-12 rounded" />
              </span>
            </span>
            <span className="skeleton h-4 w-16 rounded" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-bg/55 px-3 py-2.5">
            {Array.from({ length: 3 }, (_, j) => <span key={j} className="skeleton h-7 rounded" />)}
          </div>
        </div>
      ))}
    </>
  );
}
