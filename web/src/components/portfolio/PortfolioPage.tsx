import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ADDRESSES } from "@monolimit/shared";
import {
  useActivity,
  useHoldingsHistory,
  usePortfolio,
  type HistoryRange,
} from "../../hooks/portfolio.ts";
import { STATUS, useUserOrders } from "../../hooks/orders.ts";
import { fmtPct, fmtUsd } from "../../lib/format.ts";
import { AssetsTable } from "./AssetsTable.tsx";
import { PortfolioSide } from "./PortfolioSide.tsx";
import { ValueChart } from "./ValueChart.tsx";
import { usePersistentState } from "../../lib/persist.ts";

const RANGES: HistoryRange[] = ["1D", "1W", "1M"];
const isRange = (v: HistoryRange) => RANGES.includes(v);

/**
 * Portfolio dashboard — every number is live: balances from a multicall over
 * the known Monad token universe, prices from GeckoTerminal, value history
 * from real OHLCV, activity from raw Transfer logs, open orders from the
 * books. No mock data anywhere.
 */
export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [hidden, setHidden] = usePersistentState<boolean>("portfolio-hidden", false);
  const [headRange, setHeadRange] = usePersistentState<HistoryRange>("portfolio-head-range", "1D", isRange);
  const [perfRange, setPerfRange] = usePersistentState<HistoryRange>("portfolio-perf-range", "1W", isRange);
  const portfolio = usePortfolio();
  const p = portfolio.data;
  const headHistory = useHoldingsHistory(p, headRange);
  const perfHistory = useHoldingsHistory(p, perfRange);
  const activity = useActivity();
  const orders = useUserOrders();

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-lg font-semibold">Connect a wallet to see your portfolio</div>
        <div className="max-w-sm text-center text-xs text-muted">
          Balances, prices and activity are read live from Monad — nothing is stored.
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

  const openOrders = orders.data?.filter((o) => o.status === STATUS.Open).length;
  const executed = orders.data?.filter((o) => o.status === STATUS.Executed).length;
  const up = (p?.change24hUsd ?? 0) >= 0;
  // live USD price per token (MON keys as WMON) — activity rows use this
  const priceOf = new Map<string, number>();
  for (const a of p?.assets ?? []) {
    if (a.priceUsd == null) continue;
    priceOf.set((a.address ?? ADDRESSES.WMON).toLowerCase(), a.priceUsd);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
        {/* ---- left column ---- */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* header card: value · live chart · chips + stats */}
          <div className="rounded-xl border border-line bg-raised/40 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
              <div className="shrink-0 xl:w-56">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">My Portfolio</span>
                  <button
                    onClick={() => setHidden((v) => !v)}
                    aria-label={hidden ? "Show values" : "Hide values"}
                    className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-overlay hover:text-fg"
                  >
                    <EyeGlyph off={hidden} />
                  </button>
                </div>
                {portfolio.isLoading ? (
                  <span className="skeleton mt-2 block h-10 w-44 rounded" />
                ) : (
                  <div className="mt-1 text-[34px] font-bold leading-tight tabular-nums">
                    {hidden ? "••••••" : fmtUsd(p?.totalUsd ?? 0)}
                  </div>
                )}
                <div className="mt-0.5 flex items-center gap-1.5 text-sm">
                  {p && p.change24hPct != null ? (
                    <>
                      <span className={`font-medium tabular-nums ${up ? "text-up" : "text-down"}`}>
                        {hidden
                          ? "•••"
                          : `${up ? "+ " : "− "}${fmtUsd(Math.abs(p.change24hUsd))} (${fmtPct(p.change24hPct)})`}
                      </span>
                      <span className="text-muted">24h</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </div>
              </div>

              {/* live holdings-value chart */}
              <div className="min-w-0 flex-1">
                {headHistory.data && headHistory.data.length > 1 ? (
                  <ValueChart
                    points={headHistory.data}
                    range={headRange}
                    id="head-grad"
                    className="h-20 w-full"
                  />
                ) : (
                  <div className="skeleton h-20 w-full rounded" />
                )}
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-4 xl:items-end">
                <Chips value={headRange} onChange={setHeadRange} />
                <div className="grid grid-cols-2 gap-y-3 sm:flex sm:divide-x sm:divide-line">
                  <Stat
                    label="24h P&L"
                    value={
                      p?.change24hPct == null
                        ? "—"
                        : hidden
                          ? "•••"
                          : `${up ? "+" : "−"}${fmtUsd(Math.abs(p.change24hUsd))}`
                    }
                    tone={p?.change24hPct == null ? undefined : up ? "up" : "down"}
                  />
                  <Stat label="Assets" value={p ? String(p.assets.length) : "—"} />
                  <Stat
                    label="Open Orders"
                    value={openOrders != null ? String(openOrders) : "—"}
                  />
                  <Stat label="Executed" value={executed != null ? String(executed) : "—"} />
                </div>
              </div>
            </div>
          </div>

          <AssetsTable
            assets={p?.assets ?? []}
            totalUsd={p?.totalUsd ?? 0}
            loading={portfolio.isLoading}
            hidden={hidden}
          />

          {/* performance overview: holdings value vs MON benchmark */}
          <div className="rounded-xl border border-line bg-raised/40 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <span className="text-[15px] font-semibold">Performance Overview</span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-0.5 w-4 rounded bg-brand" /> Holdings Value
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-0 w-4 border-t border-dashed border-muted" /> Benchmark (MON)
                </span>
              </div>
              <Chips value={perfRange} onChange={setPerfRange} />
            </div>
            {perfHistory.data && perfHistory.data.length > 1 ? (
              <ValueChart
                points={perfHistory.data}
                range={perfRange}
                id="perf-grad"
                axes
                masked={hidden}
                className="w-full"
              />
            ) : perfHistory.isLoading || portfolio.isLoading ? (
              <div className="skeleton h-52 w-full rounded" />
            ) : (
              <div className="flex h-52 items-center justify-center text-xs text-muted">
                Not enough price history for these holdings yet.
              </div>
            )}
            <div className="mt-1 text-[10px] text-muted">
              Current holdings × real GeckoTerminal price history — Monad has no balance
              archive, so past buys/sells aren't reflected.
            </div>
          </div>
        </div>

        {/* ---- right rail ---- */}
        <div className="w-full shrink-0 lg:w-[330px]">
          <PortfolioSide
            assets={p?.assets ?? []}
            totalUsd={p?.totalUsd ?? 0}
            activity={activity.data}
            activityLoading={activity.isLoading}
            hidden={hidden}
            address={address}
            priceOf={priceOf}
          />
        </div>
      </div>
    </div>
  );
}

function Chips({ value, onChange }: { value: HistoryRange; onChange: (r: HistoryRange) => void }) {
  return (
    <div className="flex gap-1 self-start rounded-lg bg-overlay/60 p-0.5 xl:self-end">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value === r ? "bg-brand text-bg" : "text-muted hover:text-fg"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col gap-0.5 sm:items-end sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <span className="whitespace-nowrap text-[11px] text-muted">{label}</span>
      <span
        className={`text-[15px] font-semibold tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EyeGlyph({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      {off && <path d="M4 16 16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}
