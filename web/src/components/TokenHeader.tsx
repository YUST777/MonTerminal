import { useLivePrice, usePoolStats } from "../hooks/market.ts";
import { fmtPct, fmtPrice, fmtUsd, shortAddr } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

/**
 * Stats strip below the market bar: big USD price + 24H change, then
 * divider-separated inline stats — pool price, volume, liquidity, FDV.
 * On-chain slot0 drives the quote price (same source the contract reads).
 */
export function TokenHeader() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);

  if (!token || !pool) return null;
  const chg = stats?.change24hPct;
  const up = (chg ?? 0) >= 0;

  return (
    <div className="flex h-11 items-center gap-4 overflow-x-auto border-b border-line bg-bg px-4 whitespace-nowrap">
      <span className="text-lg font-semibold tabular-nums">
        {stats?.priceUsd != null ? fmtUsd(stats.priceUsd) : "…"}
      </span>
      <span className="flex items-baseline gap-1.5 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">24h</span>
        <span className={`rounded px-1 font-medium ${up ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>
          {chg != null ? fmtPct(chg) : "—"}
        </span>
      </span>

      <Divider />
      <InlineStat label={`Price ${pool.quote.symbol}`} value={live ? fmtPrice(live.price) : "—"} />
      <Divider />
      <InlineStat
        label="24h Vol"
        value={stats?.volume24hUsd != null ? fmtUsd(stats.volume24hUsd) : "—"}
      />
      <Divider />
      <InlineStat
        label="Liquidity"
        value={stats?.liquidityUsd != null ? fmtUsd(stats.liquidityUsd) : "—"}
      />
      <Divider />
      <InlineStat label="FDV" value={stats?.fdvUsd != null ? fmtUsd(stats.fdvUsd) : "—"} />
      <Divider />
      <InlineStat
        label="Pool"
        value={`${pool.market.label} ${pool.fee / 10_000}%`}
      />

      <a
        href={`https://monadscan.com/token/${token.address}`}
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-xs text-muted hover:text-brand"
      >
        {shortAddr(token.address)} ↗
      </a>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-line" aria-hidden />;
}
