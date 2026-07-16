import { useMemo, useState } from "react";
import { tickToExecutionPrice, computeTrigger } from "@monolimit/shared";
import { useLivePrice } from "../hooks/market.ts";
import { buildOrderParams, usePlaceOrders, useTokenBalance } from "../hooks/trade.ts";
import { fmtAmount, fmtPrice } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";
import { useToasts } from "./Toasts.tsx";

/* ── shared bits ─────────────────────────────────────────────────────────── */

function PctOfBalance({
  balance,
  decimals,
  pct,
  setPct,
}: {
  balance: bigint | undefined;
  decimals: number;
  pct: number;
  setPct: (p: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>Amount ({pct}% of balance)</span>
        <span>{balance !== undefined ? fmtAmount(balance, decimals) : "—"}</span>
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        className="w-full accent-(--color-brand)"
      />
      <div className="mt-1 flex gap-1">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            onClick={() => setPct(p)}
            className={`flex-1 rounded border px-1 py-0.5 text-[11px] ${
              pct === p ? "border-brand text-brand" : "border-line text-muted hover:text-fg"
            }`}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two-step stepper: approve (once per token) → place. */
export function ApprovalGate({
  needsApproval,
  onApprove,
  onPlace,
  placeLabel,
  disabled,
  busy,
}: {
  needsApproval: boolean;
  onApprove: () => Promise<void>;
  onPlace: () => Promise<void>;
  placeLabel: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const push = useToasts((s) => s.push);
  const [step, setStep] = useState<"idle" | "approving" | "placing">("idle");

  const run = async (fn: () => Promise<void>, phase: "approving" | "placing") => {
    setStep(phase);
    try {
      await fn();
    } catch (err) {
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
    } finally {
      setStep("idle");
    }
  };

  return (
    <div className="mt-2.5 space-y-2">
      {needsApproval && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-brand text-brand">
            1
          </span>
          One-time approval lets the book pull tokens only when your trigger fires.
        </div>
      )}
      {needsApproval ? (
        <button
          onClick={() => run(onApprove, "approving")}
          disabled={disabled || step !== "idle" || busy}
          className="w-full rounded bg-brand py-1.5 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-40"
        >
          {step === "approving" ? "Approving…" : "Approve"}
        </button>
      ) : (
        <button
          onClick={() => run(onPlace, "placing")}
          disabled={disabled || step !== "idle" || busy}
          className="w-full rounded bg-brand py-1.5 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-40"
        >
          {step === "placing" ? "Placing…" : placeLabel}
        </button>
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted">{k}</span>
      <span className={tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : ""}>
        {v}
      </span>
    </div>
  );
}

/* ── stop-loss ───────────────────────────────────────────────────────────── */

const SL_PRESETS = [
  { label: "−25%", mult: 0.75 },
  { label: "−50%", mult: 0.5 },
  { label: "−75%", mult: 0.25 },
];

export function StopLossForm() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: balance } = useTokenBalance(token?.address);
  const [mult, setMult] = useState(0.5);
  const [pct, setPct] = useState(100);
  const { needsApproval, approve, place } = usePlaceOrders(token);

  const amountIn = balance !== undefined ? (balance * BigInt(pct)) / 100n : 0n;

  const triggerPrice = useMemo(() => {
    if (!token || !live || !pool) return null;
    const q = pool.quote;
    const { triggerTick } = computeTrigger("sl", live.tick, mult, token.address, q.address);
    return tickToExecutionPrice(triggerTick, token.address, q.address, token.decimals, q.decimals);
  }, [token, live, mult, pool]);

  if (!token || !pool) return null;

  return (
    <div className="space-y-2.5 p-2.5">
      <div className="flex gap-1">
        {SL_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setMult(p.mult)}
            className={`flex-1 rounded border py-0.5 text-xs ${
              mult === p.mult ? "border-down text-down" : "border-line text-muted hover:text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <PctOfBalance balance={balance} decimals={token.decimals} pct={pct} setPct={setPct} />
      <div className="rounded border border-line bg-bg p-2">
        <Row k="Sell" v={`${fmtAmount(amountIn, token.decimals)} ${token.symbol}`} />
        <Row k="Trigger (60s TWAP)" v={triggerPrice ? `${fmtPrice(triggerPrice)} ${pool.quote.symbol}` : "—"} tone="down" />
        <Row k="Max slippage vs TWAP" v="5%" />
        <Row k="Payout" v={pool.quote.symbol === "WMON" ? "native MON" : pool.quote.symbol} />
        <Row k="Keeper fee" v="0.30%" />
      </div>
      <ApprovalGate
        needsApproval={needsApproval(amountIn)}
        onApprove={approve}
        onPlace={async () => {
          if (!live) return;
          await place([
            buildOrderParams(
              { kind: "sl", amountIn, multiple: mult, maxSlippageBps: 500 },
              token,
              pool,
              live.tick,
            ),
          ]);
        }}
        placeLabel={`Place stop-loss at ${SL_PRESETS.find((p) => p.mult === mult)?.label ?? mult}`}
        disabled={amountIn === 0n || !live}
      />
    </div>
  );
}

/* ── take-profit ─────────────────────────────────────────────────────────── */

const TP_PRESETS = [2, 3, 5, 10];

export function TakeProfitForm() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: balance } = useTokenBalance(token?.address);
  const [mult, setMult] = useState(2);
  const [pct, setPct] = useState(50);
  const { needsApproval, approve, place } = usePlaceOrders(token);

  const amountIn = balance !== undefined ? (balance * BigInt(pct)) / 100n : 0n;
  const triggerPrice = useMemo(() => {
    if (!token || !live || !pool) return null;
    const q = pool.quote;
    const { triggerTick } = computeTrigger("tp", live.tick, mult, token.address, q.address);
    return tickToExecutionPrice(triggerTick, token.address, q.address, token.decimals, q.decimals);
  }, [token, live, mult, pool]);

  if (!token || !pool) return null;

  return (
    <div className="space-y-2.5 p-2.5">
      <div className="flex gap-1">
        {TP_PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => setMult(m)}
            className={`flex-1 rounded border py-0.5 text-xs ${
              mult === m ? "border-up text-up" : "border-line text-muted hover:text-fg"
            }`}
          >
            {m}×
          </button>
        ))}
      </div>
      <PctOfBalance balance={balance} decimals={token.decimals} pct={pct} setPct={setPct} />
      <div className="rounded border border-line bg-bg p-2">
        <Row k="Sell" v={`${fmtAmount(amountIn, token.decimals)} ${token.symbol}`} />
        <Row k="Trigger price" v={triggerPrice ? `${fmtPrice(triggerPrice)} ${pool.quote.symbol}` : "—"} tone="up" />
        <Row k="Guaranteed min fill" v="ask price (minOut IS the trigger)" />
        <Row k="Payout" v={pool.quote.symbol === "WMON" ? "native MON" : pool.quote.symbol} />
        <Row k="Keeper fee" v="0.30%" />
      </div>
      <ApprovalGate
        needsApproval={needsApproval(amountIn)}
        onApprove={approve}
        onPlace={async () => {
          if (!live) return;
          await place([
            buildOrderParams({ kind: "tp", amountIn, multiple: mult }, token, pool, live.tick),
          ]);
        }}
        placeLabel={`Place take-profit at ${mult}×`}
        disabled={amountIn === 0n || !live}
      />
    </div>
  );
}

/* ── ladder ──────────────────────────────────────────────────────────────── */

interface Rung {
  pct: number; // % of balance
  mult: number; // price multiple (>1 TP, <1 SL)
}

/** GMGN-style preset: sell 50% at 2×, 25% at 5×, let the rest ride + a −50% stop. */
const GMGN_PRESET: Rung[] = [
  { pct: 50, mult: 2 },
  { pct: 25, mult: 5 },
];

export function LadderBuilder() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: balance } = useTokenBalance(token?.address);
  const [rungs, setRungs] = useState<Rung[]>(GMGN_PRESET);
  const [stopPct, setStopPct] = useState<number | null>(100); // % of balance protected by SL
  const { needsApproval, approve, place } = usePlaceOrders(token);

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
        disabled={!valid || !live || balance === undefined || balance === 0n}
      />
    </div>
  );
}
