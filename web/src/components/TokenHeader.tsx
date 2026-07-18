import { useLivePrice, usePoolStats, useTokenMedia } from "../hooks/market.ts";
import { fmtPct, fmtPrice, fmtUsd, shortAddr } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

/** "https://x.com/foo/…" → "x.com" — social links render as their host. */
function linkHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Stats strip below the market bar: big USD price + 24H change, then
 * divider-separated inline stats — pool price, volume, liquidity, FDV.
 * The token itself is named by the market selector right above, so no
 * icon/symbol here. On-chain slot0 drives the quote price (same source
 * the contract reads). Launchpad tokens also surface their social links
 * (from on-chain getTokenInfo metadata).
 */
export function TokenHeader() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);
  const { data: media } = useTokenMedia(token?.address);

  if (!token) return null;
  if (!pool) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-bg px-2 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-8 sm:px-3">
        <span className="text-sm font-semibold">{token.name}</span>
        <span className="rounded bg-up/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-up">
          Contract detected
        </span>
        <InlineStat label="Decimals" value={String(token.decimals)} />
        <a
          href={`https://monadscan.com/token/${token.address}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto shrink-0 text-[11px] text-muted hover:text-brand"
        >
          {shortAddr(token.address)} ↗
        </a>
      </div>
    );
  }
  const chg = stats?.change24hPct;
  const up = (chg ?? 0) >= 0;
  const links = (media?.links ?? [])
    .map((url) => ({ url, host: linkHost(url) }))
    .filter((l): l is { url: string; host: string } => l.host !== null);

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-bg px-2 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-8 sm:gap-3 sm:px-3">
      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
        {stats?.priceUsd != null ? fmtUsd(stats.priceUsd) : "…"}
      </span>
      <span className="flex items-baseline gap-1 text-xs">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">24h</span>
        <span className={`rounded px-1 font-medium ${up ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>
          {chg != null ? fmtPct(chg) : "—"}
        </span>
      </span>

      <Divider />
      <InlineStat label={`Price ${pool.quote.symbol}`} value={live ? fmtPrice(live.price) : "—"} />
      <span className="contents max-sm:hidden">
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
      </span>

      <a
        href={`https://monadscan.com/token/${token.address}`}
        target="_blank"
        rel="noreferrer"
        className="ml-auto shrink-0 text-[11px] text-muted hover:text-brand"
      >
        {shortAddr(token.address)} ↗
      </a>
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          title={l.url}
          className="hidden shrink-0 text-[11px] text-muted hover:text-brand sm:inline"
        >
          {l.host} ↗
        </a>
      ))}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}

function Divider() {
  return <span className="h-3.5 w-px shrink-0 bg-line" aria-hidden />;
}
