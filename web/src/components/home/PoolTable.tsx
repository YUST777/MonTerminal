import { useState } from "react";
import { usePublicClient } from "wagmi";
import { MARKETS } from "@monolimit/shared";
import { lookupTopPool } from "../../hooks/market.ts";
import type { TopPool } from "../../lib/gecko.ts";
import { fmtAge, fmtPct, fmtUsd } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { useToasts } from "../Toasts.tsx";

/** Logo with letter-avatar fallback (gecko image can 404 or be missing). */
function TokenLogo({ url, symbol }: { url: string | null; symbol: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="size-6 shrink-0 rounded-full ring-1 ring-line"
      />
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-overlay text-[10px] font-bold text-brand ring-1 ring-line">
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** GMGN-style token list: click a row to open it in the trading terminal. */
export function PoolTable({
  pools,
  loading,
  showAge = false,
}: {
  pools: TopPool[] | undefined;
  loading: boolean;
  showAge?: boolean;
}) {
  const client = usePublicClient();
  const setMarket = useTerminal((s) => s.setMarket);
  const push = useToasts((s) => s.push);
  const [resolving, setResolving] = useState<string | null>(null);

  const pick = async (p: TopPool) => {
    if (!client || resolving) return;
    setResolving(p.address);
    try {
      const r = await lookupTopPool(client, p);
      setMarket(r.token, r.pool);
    } catch (err) {
      push("error", (err as Error).message.slice(0, 140));
    } finally {
      setResolving(null);
    }
  };

  const grid = showAge
    ? "grid grid-cols-[2.2fr_1fr_0.8fr_1fr_1fr_0.6fr] items-center gap-2"
    : "grid grid-cols-[2.2fr_1fr_0.8fr_1fr_1fr] items-center gap-2";

  return (
    <div className="overflow-hidden rounded-md border border-line bg-raised/40">
      <div
        className={`${grid} border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted`}
      >
        <span>Token</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Liquidity</span>
        {showAge && <span className="text-right">Age</span>}
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {loading && <div className="px-3 py-3 text-xs text-muted">Loading live pools…</div>}
        {!loading && (pools?.length ?? 0) === 0 && (
          <div className="px-3 py-3 text-xs text-muted">
            No pools indexed yet — paste a token address in the market selector above.
          </div>
        )}
        {(pools ?? []).map((p) => {
          const chg = p.change24hPct;
          const market = MARKETS.find((m) => m.dexId === p.dexId);
          return (
            <button
              key={p.address}
              onClick={() => pick(p)}
              disabled={!!resolving}
              className={`${grid} w-full px-3 py-2 text-left text-[13px] hover:bg-raised disabled:opacity-60`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <TokenLogo url={p.imageUrl} symbol={p.baseSymbol} />
                <span className="truncate font-semibold">{p.baseSymbol}</span>
                <span className="truncate text-[11px] text-muted">/{p.quoteSymbol}</span>
                <span className="rounded bg-overlay px-1 py-px text-[8px] font-medium uppercase text-muted">
                  {market?.label.split(" ")[0]}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {resolving === p.address ? "…" : p.priceUsd != null ? fmtUsd(p.priceUsd) : "—"}
              </span>
              <span
                className={`text-right tabular-nums ${chg == null ? "text-muted" : chg >= 0 ? "text-up" : "text-down"}`}
              >
                {chg != null ? fmtPct(chg) : "—"}
              </span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.volume24hUsd)}</span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.reserveUsd)}</span>
              {showAge && (
                <span className="text-right tabular-nums text-muted">
                  {p.createdAtSec != null ? fmtAge(p.createdAtSec) : "—"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
