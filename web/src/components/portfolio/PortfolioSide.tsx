import type { ActivityEntry, PortfolioAsset } from "../../hooks/portfolio.ts";
import { fmtAge, fmtAmountNum, fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import type { PortfolioPricePoint } from "../../lib/portfolioHistory.ts";
import { TokenIcon } from "../TokenIcon.tsx";
import { Sparkline } from "./AssetsTable.tsx";

// Brand-led allocation palette — biggest slice wears the MonTerminal periwinkle.
const PALETTE = ["#a091f0", "#6ea8fe", "#ffd58a", "#ff9c9c", "#77c7af", "#d3e97a", "#8b8e9c"];
const EXPLORER = "https://monadscan.com";

/** Right rail: allocation donut, top gainers among holdings, on-chain activity. */
export function PortfolioSide({
  assets,
  totalUsd,
  activity,
  activityLoading,
  hidden,
  address,
  priceOf,
  history,
}: {
  assets: PortfolioAsset[];
  totalUsd: number;
  activity: ActivityEntry[] | undefined;
  activityLoading: boolean;
  hidden: boolean;
  address: string | undefined;
  /** live USD price by token address (lowercased) — for activity $ lines */
  priceOf: Map<string, number>;
  history: Record<string, PortfolioPricePoint[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Allocation assets={assets} totalUsd={totalUsd} hidden={hidden} />
      <TopGainers assets={assets} history={history} />
      <RecentActivity
        items={activity}
        loading={activityLoading}
        hidden={hidden}
        address={address}
        priceOf={priceOf}
      />
    </div>
  );
}

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-raised/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-semibold">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** SVG donut over the priced holdings — top 6 slices + "Other", total in the middle. */
function Allocation({
  assets,
  totalUsd,
  hidden,
}: {
  assets: PortfolioAsset[];
  totalUsd: number;
  hidden: boolean;
}) {
  const priced = assets.filter((a) => a.valueUsd > 0);
  const top = priced.slice(0, 6);
  const otherUsd = priced.slice(6).reduce((s, a) => s + a.valueUsd, 0);
  const slices = [
    ...top.map((a) => ({ label: a.symbol, value: a.valueUsd })),
    ...(otherUsd > 0 ? [{ label: "Other", value: otherUsd }] : []),
  ];
  if (totalUsd <= 0 || slices.length === 0) {
    return (
      <Card title="Portfolio Allocation">
        <div className="text-xs text-muted">Nothing priced yet.</div>
      </Card>
    );
  }
  // r = 100/2π → circumference 100, so dasharray works in percent directly
  let offset = 25;
  return (
    <Card title="Portfolio Allocation">
      <div className="flex items-center gap-4">
        <div className="relative size-36 shrink-0">
          <svg viewBox="0 0 42 42" className="size-full -rotate-0" aria-hidden>
            {slices.map((s, i) => {
              const pct = (s.value / totalUsd) * 100;
              const el = (
                <circle
                  key={s.label}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(0.1, pct - 1.2)} ${100 - Math.max(0.1, pct - 1.2)}`}
                  strokeDashoffset={offset}
                />
              );
              offset -= pct;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted">Total</span>
            <span className="text-sm font-bold tabular-nums">
              {hidden ? "•••" : fmtUsd(totalUsd)}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
          {slices.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
              <span className="tabular-nums text-muted">
                {((s.value / totalUsd) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Best 24h movers among what the wallet actually holds. */
function TopGainers({
  assets,
  history,
}: {
  assets: PortfolioAsset[];
  history: Record<string, PortfolioPricePoint[]>;
}) {
  const gainers = assets
    .filter((a) => a.change24hPct != null)
    .sort((a, b) => b.change24hPct! - a.change24hPct!)
    .slice(0, 3);
  return (
    <Card
      title="Top Gainers"
      aside={<span className="rounded-md border border-line px-2 py-0.5 text-[10px] text-muted">24h</span>}
    >
      {gainers.length === 0 ? (
        <div className="text-xs text-muted">No 24h data for these holdings.</div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {gainers.map((a) => {
            const up = a.change24hPct! >= 0;
            return (
              <div key={a.address ?? "native"} className="flex items-center gap-3 text-[13px]">
                <TokenIcon url={a.logo} symbol={a.symbol} size="size-8" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{a.symbol}</span>
                  <span className="truncate text-[11px] text-muted">{a.name}</span>
                </span>
                {a.pool && (
                  <Sparkline data={history[a.pool.toLowerCase()]} up={up} className="h-5 w-14" />
                )}
                <span className="flex w-18 flex-col items-end">
                  <span
                    className={`text-xs font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}
                  >
                    {fmtPct(a.change24hPct!)}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {a.priceUsd != null ? fmtUsd(a.priceUsd) : "—"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** ERC-20 transfers in/out of the wallet over the last ~day, from chain logs. */
function RecentActivity({
  items,
  loading,
  hidden,
  address,
  priceOf,
}: {
  items: ActivityEntry[] | undefined;
  loading: boolean;
  hidden: boolean;
  address: string | undefined;
  priceOf: Map<string, number>;
}) {
  return (
    <Card
      title="Recent Activity"
      aside={
        address ? (
          <a
            href={`${EXPLORER}/address/${address}#tokentxns`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-brand hover:underline"
          >
            View All
          </a>
        ) : undefined
      }
    >
      {loading && !items && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="skeleton h-9 rounded-md" />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <div className="text-xs text-muted">No token transfers in the last ~24h.</div>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-1">
          {items.map((t) => (
            <ActivityRow key={t.tx} t={t} hidden={hidden} priceOf={priceOf} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityRow({
  t,
  hidden,
  priceOf,
}: {
  t: ActivityEntry;
  hidden: boolean;
  priceOf: Map<string, number>;
}) {
  const main = t.inLeg ?? t.outLeg;
  const price = main ? priceOf.get(main.token.toLowerCase()) : undefined;
  const usd = main && price != null ? main.amount * price : null;
  const title = t.kind === "swap" ? "Swap" : t.kind === "in" ? "Receive" : "Send";
  const sub =
    t.kind === "swap"
      ? `${t.outLeg?.symbol ?? "?"} → ${t.inLeg?.symbol ?? "?"}`
      : t.counterparty
        ? `${t.kind === "in" ? "from" : "to"} ${shortAddr(t.counterparty)}`
        : "";
  const signedIn = t.inLeg != null;
  return (
    <a
      href={`${EXPLORER}/tx/${t.tx}`}
      target="_blank"
      rel="noreferrer"
      className="-mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-2 hover:bg-raised"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-overlay text-sm">
        {t.kind === "swap" ? "⇄" : t.kind === "in" ? "↓" : "↑"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <span className="truncate text-[11px] text-muted">{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span
          className={`text-xs font-semibold tabular-nums ${signedIn ? "text-up" : "text-down"}`}
        >
          {main
            ? `${signedIn ? "+" : "−"}${hidden ? "•••" : fmtAmountNum(main.amount)} ${main.symbol}`
            : "—"}
        </span>
        <span className="text-[10px] tabular-nums text-muted">
          {usd != null && !hidden ? `${fmtUsd(usd)} · ` : ""}
          {fmtAge(t.tsSec)} ago
        </span>
      </span>
    </a>
  );
}
