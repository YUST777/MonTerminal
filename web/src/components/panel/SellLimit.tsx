import { useMemo, useState } from "react";
import { computeTrigger, tickToExecutionPrice } from "@monolimit/shared";
import { useLivePrice, usePoolStats } from "../../hooks/market.ts";
import {
  buildOrderParams,
  usePlaceOrders,
  useTokenBalance,
  useTwapAvailable,
} from "../../hooks/trade.ts";
import { fmtAmount, fmtPct, fmtPrice, fmtUsd } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { ApprovalGate, PctOfBalance, Row, TwapWarning } from "./shared.tsx";

const TRIG_PRESETS = [-50, -25, 25, 100, 300];

/** ±% trigger distance: slider (−99…+100) + free input (−99…+1000) + presets. */
function TriggerSlider({ value, setValue }: { value: number; setValue: (v: number) => void }) {
  const clamp = (v: number) => Math.max(-99, Math.min(1000, Math.round(v)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted">Trigger distance from current price</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={-99}
            max={1000}
            value={value}
            onChange={(e) => setValue(clamp(Number(e.target.value) || 0))}
            className={`w-16 rounded border border-line bg-bg px-1.5 py-0.5 text-right tabular-nums ${
              value < 0 ? "text-down" : value > 0 ? "text-up" : ""
            }`}
          />
          <span className="text-muted">%</span>
        </span>
      </div>
      <input
        type="range"
        min={-99}
        max={100}
        step={1}
        value={Math.min(value, 100)}
        onChange={(e) => setValue(Number(e.target.value))}
        className={`w-full ${value < 0 ? "accent-(--color-down)" : "accent-(--color-up)"}`}
      />
      <div className="flex justify-between text-[10px] text-muted">
        <span className="text-down">stop-loss ←</span>
        <span>0</span>
        <span className="text-up">→ take-profit</span>
      </div>
      <div className="mt-1 flex gap-1">
        {TRIG_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setValue(p)}
            className={`flex-1 rounded border px-1 py-0.5 text-[11px] ${
              value === p
                ? p < 0
                  ? "border-down text-down"
                  : "border-up text-up"
                : "border-line text-muted hover:text-fg"
            }`}
          >
            {p > 0 ? `+${p}%` : `−${-p}%`}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Limit sell — one form for both sides: a negative trigger distance is a
 * stop-loss, a positive one a take-profit. Same on-chain book either way.
 */
export function SellLimit() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);
  const { data: balance } = useTokenBalance(token?.address);
  const [pct, setPct] = useState(100);
  const [trigPct, setTrigPct] = useState(100);
  const { needsApproval, approve, place } = usePlaceOrders(token);
  const twapOk = useTwapAvailable(pool);

  const kind = trigPct < 0 ? ("sl" as const) : ("tp" as const);
  const multiple = 1 + trigPct / 100;
  const amountIn = balance !== undefined ? (balance * BigInt(pct)) / 100n : 0n;
  // fail open while the observe() probe is loading — only block a confirmed miss
  const twapBlocked = kind === "sl" && twapOk.data === false;

  const triggerPrice = useMemo(() => {
    if (!token || !live || !pool || trigPct === 0) return null;
    const q = pool.quote;
    const { triggerTick } = computeTrigger(kind, live.tick, multiple, token.address, q.address);
    return tickToExecutionPrice(triggerTick, token.address, q.address, token.decimals, q.decimals);
  }, [token, live, pool, kind, multiple, trigPct]);

  if (!token || !pool) return null;

  return (
    <div className="space-y-2.5 p-2.5">
      <TriggerSlider value={trigPct} setValue={setTrigPct} />
      <PctOfBalance balance={balance} decimals={token.decimals} pct={pct} setPct={setPct} />
      <div className="rounded border border-line bg-bg p-2">
        <Row k="Sell" v={`${fmtAmount(amountIn, token.decimals)} ${token.symbol}`} />
        <Row
          k={kind === "sl" ? "Trigger price · 60s TWAP" : "Trigger price"}
          v={triggerPrice ? `${fmtPrice(triggerPrice)} ${pool.quote.symbol}` : "—"}
          tone={kind === "sl" ? "down" : "up"}
        />
        {stats?.fdvUsd != null && trigPct !== 0 && (
          <Row k="MC at trigger" v={fmtUsd(stats.fdvUsd * multiple)} />
        )}
        {kind === "sl" && <Row k="Max slippage vs TWAP" v="5%" />}
        {kind === "tp" && <Row k="Guaranteed min fill" v="ask price (minOut IS the trigger)" />}
        <Row k="Payout" v={pool.quote.symbol === "WMON" ? "native MON" : pool.quote.symbol} />
        <Row k="Keeper fee" v="0.30%" />
      </div>
      {twapBlocked && <TwapWarning />}
      <ApprovalGate
        needsApproval={needsApproval(amountIn)}
        onApprove={approve}
        onPlace={async () => {
          if (!live || trigPct === 0) return;
          await place([
            buildOrderParams(
              {
                kind,
                amountIn,
                multiple,
                maxSlippageBps: kind === "sl" ? 500 : undefined,
              },
              token,
              pool,
              live.tick,
            ),
          ]);
        }}
        placeLabel={
          trigPct === 0
            ? "Set a trigger distance"
            : `Place ${kind === "sl" ? "stop-loss" : "take-profit"} at ${fmtPct(trigPct)}`
        }
        disabled={amountIn === 0n || !live || trigPct === 0 || twapBlocked}
      />
    </div>
  );
}
