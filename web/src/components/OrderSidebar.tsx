import { tickToExecutionPrice } from "@monolimit/shared";
import { TradePanel } from "./panel/TradePanel.tsx";
import { useLivePrice, usePoolStats } from "../hooks/market.ts";
import { KIND, STATUS, orderKey, useUserOrders } from "../hooks/orders.ts";
import { useCancelOrders, useTokenBalance } from "../hooks/trade.ts";
import { fmtAmount, fmtPct, fmtPrice, fmtUsd } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

export function OrderSidebar() {
  const { token } = useTerminal();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-raised/40">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!token ? (
          <div className="p-3 text-center text-[11px] text-muted">
            Pick a token first — open the market selector above.
          </div>
        ) : (
          <>
            <TradePanel />
            <PositionCard />
            <MarketTriggers />
          </>
        )}
      </div>
    </div>
  );
}

/** Your bag in the selected token: balance, USD value, live price. */
function PositionCard() {
  const { token, pool } = useTerminal();
  const { data: balance } = useTokenBalance(token?.address);
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);
  if (!token || !pool) return null;

  const bal = balance !== undefined ? Number(balance) / 10 ** token.decimals : null;
  const usd = bal != null && stats?.priceUsd != null ? bal * stats.priceUsd : null;
  const chg = stats?.change24hPct;

  return (
    <div className="mx-2.5 mb-2.5 rounded border border-line bg-bg p-2 text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Your position</span>
        <span className={chg == null ? "text-muted" : chg >= 0 ? "text-up" : "text-down"}>
          {chg != null ? `${fmtPct(chg)} 24h` : ""}
        </span>
      </div>
      <Row
        k="Balance"
        v={balance !== undefined ? `${fmtAmount(balance, token.decimals)} ${token.symbol}` : "—"}
      />
      <Row k="Value" v={usd != null ? fmtUsd(usd) : "—"} />
      <Row k={`Price (${pool.quote.symbol})`} v={live ? fmtPrice(live.price) : "—"} />
      <Row k="Price (USD)" v={stats?.priceUsd != null ? fmtUsd(stats.priceUsd) : "—"} />
    </div>
  );
}

/** Open SL/TP triggers on the selected market, cancellable inline. */
function MarketTriggers() {
  const { token, pool } = useTerminal();
  const { data: orders } = useUserOrders();
  const { data: live } = useLivePrice(pool, token);
  const { cancel, isPending } = useCancelOrders();
  if (!token || !pool) return null;

  const mine = (orders ?? []).filter(
    (o) =>
      o.status === STATUS.Open &&
      o.tokenIn.toLowerCase() === token.address.toLowerCase() &&
      o.tokenOut.toLowerCase() === pool.quote.address.toLowerCase(),
  );

  return (
    <div className="mx-2.5 mb-2.5 rounded border border-line bg-bg p-2 text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Your triggers on {token.symbol}</span>
        <span className="text-muted">{mine.length}</span>
      </div>
      {mine.length === 0 && (
        <div className="py-1 text-muted">
          None yet — set a stop-loss or take-profit above and sleep easy.
        </div>
      )}
      {mine.map((o) => {
        const isSl = o.kind === KIND.StopLoss;
        const trig = tickToExecutionPrice(
          o.triggerTick,
          token.address,
          pool.quote.address,
          token.decimals,
          pool.quote.decimals,
        );
        const distPct = live && live.price > 0 ? ((trig - live.price) / live.price) * 100 : null;
        return (
          <div
            key={orderKey(o)}
            className="flex items-center gap-1.5 border-t border-line/50 py-1 first:border-t-0"
          >
            <span className={`w-4 font-bold ${isSl ? "text-down" : "text-up"}`}>
              {isSl ? "SL" : "TP"}
            </span>
            <span className="tabular-nums">
              {fmtAmount(o.amountIn, token.decimals)} @ {fmtPrice(trig)}
            </span>
            <span className="tabular-nums text-muted">
              {distPct != null ? fmtPct(distPct) : ""}
            </span>
            <button
              onClick={() => cancel([o.orderId], o.book)}
              disabled={isPending}
              className="ml-auto rounded border border-line px-1.5 py-px text-[10px] text-muted hover:border-down hover:text-down disabled:opacity-40"
            >
              cancel
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-px">
      <span className="text-muted">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
