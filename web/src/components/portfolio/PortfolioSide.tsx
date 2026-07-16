import type { ActivityItem, PortfolioAsset } from "../../hooks/portfolio.ts";
import { fmtAge, fmtAmountNum, fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import { TokenIcon } from "../TokenIcon.tsx";

const PALETTE = ["#a091f0", "#77c7af", "#6ea8fe", "#ffd58a", "#ff9c9c", "#c4b5fd", "#8b8e9c"];
const EXPLORER_TX = "https://monadscan.com/tx/";

/** Right rail: allocation donut, top gainers among holdings, on-chain activity. */
export function PortfolioSide({
  assets,
  totalUsd,
  activity,
  activityLoading,
  hidden,
}: {
  assets: PortfolioAsset[];
  totalUsd: number;
  activity: ActivityItem[] | undefined;
  activityLoading: boolean;
  hidden: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Allocation assets={assets} totalUsd={totalUsd} />
      <TopGainers assets={assets} />
      <RecentActivity items={activity} loading={activityLoading} hidden={hidden} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-raised/40 p-3">
      <div className="mb-2.5 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

/** SVG donut over the priced holdings — top 6 slices + "Other". */
function Allocation({ assets, totalUsd }: { assets: PortfolioAsset[]; totalUsd: number }) {
  const priced = assets.filter((a) => a.valueUsd > 0);
  const top = priced.slice(0, 6);
  const otherUsd = priced.slice(6).reduce((s, a) => s + a.valueUsd, 0);
  const slices = [
    ...top.map((a) => ({ label: a.symbol, value: a.valueUsd })),
    ...(otherUsd > 0 ? [{ label: "Other", value: otherUsd }] : []),
  ];
  if (totalUsd <= 0 || slices.length === 0) {
    return (
      <Card title="Allocation">
        <div className="text-xs text-muted">Nothing priced yet.</div>
      </Card>
    );
  }
  // r = 100/2π → circumference 100, so dasharray works in percent directly
  let offset = 25;
  return (
    <Card title="Allocation">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 42 42" className="size-28 shrink-0" aria-hidden>
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
                strokeWidth="5"
                strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`}
                strokeDashoffset={offset}
              />
            );
            offset -= pct;
            return el;
          })}
        </svg>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
          {slices.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
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
function TopGainers({ assets }: { assets: PortfolioAsset[] }) {
  const gainers = assets
    .filter((a) => a.change24hPct != null)
    .sort((a, b) => b.change24hPct! - a.change24hPct!)
    .slice(0, 3);
  return (
    <Card title="Top Gainers">
      {gainers.length === 0 ? (
        <div className="text-xs text-muted">No 24h data for these holdings.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {gainers.map((a) => (
            <div key={a.address ?? "native"} className="flex items-center gap-2.5 text-[13px]">
              <TokenIcon url={a.logo} symbol={a.symbol} size="size-6" />
              <span className="min-w-0 flex-1 truncate font-medium">{a.symbol}</span>
              <span className="tabular-nums text-muted">
                {a.priceUsd != null ? fmtUsd(a.priceUsd) : "—"}
              </span>
              <span
                className={`w-16 text-right text-xs font-medium tabular-nums ${
                  a.change24hPct! >= 0 ? "text-up" : "text-down"
                }`}
              >
                {fmtPct(a.change24hPct!)}
              </span>
            </div>
          ))}
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
}: {
  items: ActivityItem[] | undefined;
  loading: boolean;
  hidden: boolean;
}) {
  return (
    <Card title="Recent Activity">
      {loading && !items && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="skeleton h-6 rounded" />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <div className="text-xs text-muted">No token transfers in the last ~24h.</div>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-1">
          {items.map((t) => (
            <a
              key={`${t.tx}-${t.token}-${t.tsSec}-${t.dir}`}
              href={`${EXPLORER_TX}${t.tx}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded px-1.5 py-1.5 text-[13px] hover:bg-raised"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  t.dir === "in" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
              >
                {t.dir === "in" ? "↓" : "↑"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {t.dir === "in" ? "Received" : "Sent"} {t.symbol}
                </span>
                <span className="truncate text-[10px] text-muted">
                  {t.dir === "in" ? "from" : "to"} {shortAddr(t.counterparty)}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span
                  className={`text-xs font-medium tabular-nums ${
                    t.dir === "in" ? "text-up" : "text-down"
                  }`}
                >
                  {t.dir === "in" ? "+" : "−"}
                  {hidden ? "•••" : fmtAmountNum(t.amount)}
                </span>
                <span className="text-[10px] text-muted">{fmtAge(t.tsSec)} ago</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
