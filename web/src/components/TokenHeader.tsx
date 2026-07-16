import { useLivePrice, usePoolStats } from "../hooks/market.ts";
import { fmtPct, fmtPrice, shortAddr } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

export function TokenHeader() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);

  if (!token || !pool) return null;
  const up = (stats?.change24hPct ?? 0) >= 0;

  return (
    <div className="flex items-center gap-6 border-b border-line bg-raised px-4 py-2">
      <div>
        <div className="text-lg font-semibold leading-tight">
          {token.symbol}
          <span className="text-muted">/WMON</span>
        </div>
        <a
          href={`https://monadscan.com/token/${token.address}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted hover:text-brand"
        >
          {shortAddr(token.address)}
        </a>
      </div>
      <Stat label="Price (WMON)" value={live ? fmtPrice(live.price) : "—"} />
      <Stat
        label="Price (USD)"
        value={stats?.priceUsd != null ? `$${fmtPrice(stats.priceUsd)}` : "—"}
      />
      <Stat
        label="24h"
        value={stats?.change24hPct != null ? fmtPct(stats.change24hPct) : "—"}
        tone={up ? "up" : "down"}
      />
      <Stat
        label="24h Vol"
        value={
          stats?.volume24hUsd != null ? `$${Math.round(stats.volume24hUsd).toLocaleString()}` : "—"
        }
      />
      <Stat label="Tick" value={live ? String(live.tick) : "—"} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-sm font-medium ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""}`}>
        {value}
      </div>
    </div>
  );
}
