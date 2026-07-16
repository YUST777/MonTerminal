import { useQuery } from "@tanstack/react-query";
import { fetchOhlcv } from "../../lib/gecko.ts";
import { fmtAmountNum, fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import type { PortfolioAsset } from "../../hooks/portfolio.ts";
import { TokenIcon } from "../TokenIcon.tsx";

const GRID = "grid grid-cols-[minmax(160px,2fr)_1fr_1fr_1fr_1.2fr_1.2fr] items-center gap-2";
/** OHLCV is one gecko call per row — cap it well inside the free rate limit. */
const MAX_SPARKLINES = 8;

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
  return (
    <div className="overflow-hidden rounded-md border border-line bg-raised/40">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="text-sm font-semibold">Your Assets</span>
        <span className="text-[11px] text-muted">{assets.length} tokens</span>
      </div>
      <div
        className={`${GRID} border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted`}
      >
        <span>Asset</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span className="text-right">24h</span>
        <span className="text-right">Allocation</span>
      </div>
      {loading && <SkeletonRows />}
      {!loading && assets.length === 0 && (
        <div className="px-3 py-5 text-xs text-muted">
          No tokens found in this wallet on Monad — bridge something in to get started.
        </div>
      )}
      {assets.map((a, i) => {
        const pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
        return (
          <div
            key={a.address ?? "native"}
            className={`${GRID} border-b border-line/40 px-3 py-2.5 text-[13px] last:border-b-0`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <TokenIcon url={a.logo} symbol={a.symbol} size="size-7" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{a.symbol}</span>
                <span className="truncate text-[10px] text-muted">
                  {a.address ? shortAddr(a.address) : a.name}
                </span>
              </span>
            </span>
            <span className="text-right tabular-nums">
              {hidden ? "•••" : fmtAmountNum(a.amount)}
            </span>
            <span className="text-right tabular-nums text-muted">
              {a.priceUsd != null ? fmtUsd(a.priceUsd) : "—"}
            </span>
            <span className="text-right font-medium tabular-nums">
              {a.priceUsd == null ? "—" : hidden ? "•••" : fmtUsd(a.valueUsd)}
            </span>
            <span className="flex items-center justify-end gap-2">
              {a.pool && i < MAX_SPARKLINES && (
                <Sparkline pool={a.pool} up={(a.change24hPct ?? 0) >= 0} />
              )}
              <span
                className={`text-xs font-medium tabular-nums ${
                  a.change24hPct == null
                    ? "text-muted"
                    : a.change24hPct >= 0
                      ? "text-up"
                      : "text-down"
                }`}
              >
                {a.change24hPct != null ? fmtPct(a.change24hPct) : "—"}
              </span>
            </span>
            <span className="flex items-center justify-end gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-overlay">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-muted">
                {pct.toFixed(1)}%
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 24h close-price line from the asset's deepest pool (real OHLCV, no mock). */
function Sparkline({ pool, up }: { pool: string; up: boolean }) {
  const { data } = useQuery({
    queryKey: ["spark", pool],
    staleTime: 600_000, // one fetch per pool per 10 min is plenty for a 24h line
    retry: 0,
    queryFn: () => fetchOhlcv(pool, "1h", 24),
  });
  if (!data || data.length < 2) return null;
  const closes = data.map((c) => c.close);
  const min = Math.min(...closes);
  const range = Math.max(...closes) - min || 1;
  const pts = closes
    .map((c, i) => `${((i / (closes.length - 1)) * 58 + 1).toFixed(1)},${(15 - ((c - min) / range) * 12).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 60 16" className={`h-4 w-14 ${up ? "text-up" : "text-down"}`} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${GRID} border-b border-line/40 px-3 py-2.5`}>
          <span className="flex items-center gap-2.5">
            <span className="skeleton size-7 shrink-0 rounded-full" />
            <span className="skeleton h-3 w-20 rounded" />
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
