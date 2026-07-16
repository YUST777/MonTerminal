import { useState } from "react";
import { useLivePrice } from "../../hooks/market.ts";
import {
  buildOrderParams,
  usePlaceOrders,
  useTokenBalance,
  useTwapAvailable,
} from "../../hooks/trade.ts";
import { useTerminal } from "../../state/terminal.ts";
import { ApprovalGate, Row, TwapWarning } from "./shared.tsx";

interface Rung {
  pct: number; // % of balance
  mult: number; // price multiple (>1 TP, <1 SL)
}

/** GMGN-style preset: sell 50% at 2×, 25% at 5×, let the rest ride + a −50% stop. */
const GMGN_PRESET: Rung[] = [
  { pct: 50, mult: 2 },
  { pct: 25, mult: 5 },
];

/** Auto: laddered take-profits + optional stop, placed in one atomic tx. */
export function AutoLadder() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: balance } = useTokenBalance(token?.address);
  const [rungs, setRungs] = useState<Rung[]>(GMGN_PRESET);
  const [stopPct, setStopPct] = useState<number | null>(100); // % of balance protected by SL
  const { needsApproval, approve, place } = usePlaceOrders(token);
  const twapOk = useTwapAvailable(pool);
  // fail open while loading — only block when we've confirmed observe() reverts
  const stopBlocked = stopPct !== null && twapOk.data === false;

  const totalPct = rungs.reduce((s, r) => s + r.pct, 0);
  const valid = totalPct <= 100 && rungs.every((r) => r.pct > 0 && r.mult > 1);

  if (!token || !pool) return null;

  const update = (i: number, patch: Partial<Rung>) =>
    setRungs((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const buildAll = () => {
    if (!live || balance === undefined) return [];
    const params = rungs.map((r) =>
      buildOrderParams(
        { kind: "tp", amountIn: (balance * BigInt(r.pct)) / 100n, multiple: r.mult },
        token,
        pool,
        live.tick,
      ),
    );
    if (stopPct) {
      params.push(
        buildOrderParams(
          {
            kind: "sl",
            amountIn: (balance * BigInt(stopPct)) / 100n,
            multiple: 0.5,
            maxSlippageBps: 500,
          },
          token,
          pool,
          live.tick,
        ),
      );
    }
    return params;
  };

  const totalAmount = balance !== undefined ? (balance * BigInt(Math.min(totalPct, 100))) / 100n : 0n;
  const slAmount = stopPct && balance !== undefined ? (balance * BigInt(stopPct)) / 100n : 0n;
  const approvalTotal = totalAmount > slAmount ? totalAmount : slAmount;

  return (
    <div className="space-y-2.5 p-2.5">
      <div className="text-[11px] text-muted">
        Sell tranches at multiples — one atomic tx, each rung cancellable on its own. The rest
        rides.
      </div>
      {rungs.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-muted">sell</span>
          <input
            type="number"
            min={1}
            max={100}
            value={r.pct}
            onChange={(e) => update(i, { pct: Number(e.target.value) })}
            className="w-14 rounded border border-line bg-bg px-1.5 py-0.5 text-right"
          />
          <span className="text-muted">% at</span>
          <input
            type="number"
            min={1.1}
            step={0.5}
            value={r.mult}
            onChange={(e) => update(i, { mult: Number(e.target.value) })}
            className="w-14 rounded border border-line bg-bg px-1.5 py-0.5 text-right"
          />
          <span className="text-muted">×</span>
          <button
            onClick={() => setRungs((rs) => rs.filter((_, j) => j !== i))}
            className="ml-auto text-muted hover:text-down"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => setRungs((rs) => [...rs, { pct: 10, mult: 3 }])}
          className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
        >
          + rung
        </button>
        <button
          onClick={() => setRungs(GMGN_PRESET)}
          className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
        >
          GMGN preset
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={stopPct !== null}
          onChange={(e) => setStopPct(e.target.checked ? 100 : null)}
          className="accent-(--color-down)"
        />
        <span>
          Protect with a <span className="text-down">−50% stop-loss</span> on the full bag
        </span>
      </label>
      {stopBlocked && <TwapWarning />}
      <div className="rounded border border-line bg-bg p-2">
        <Row
          k="Total laddered"
          v={`${totalPct}% of balance`}
          tone={totalPct > 100 ? "warn" : undefined}
        />
        {totalPct > 100 && <Row k="" v="Σ must be ≤ 100%" tone="warn" />}
        <Row k="Orders in tx" v={String(rungs.length + (stopPct ? 1 : 0))} />
      </div>
      <ApprovalGate
        needsApproval={needsApproval(approvalTotal)}
        onApprove={approve}
        onPlace={async () => {
          await place(buildAll());
        }}
        placeLabel="Place ladder"
        disabled={!valid || !live || balance === undefined || balance === 0n || stopBlocked}
      />
    </div>
  );
}
