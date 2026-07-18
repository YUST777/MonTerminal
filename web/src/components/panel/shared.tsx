import { useEffect, useState } from "react";
import { fmtAmount, fmtPrice } from "../../lib/format.ts";
import { useToasts } from "../Toasts.tsx";

/* ── bits shared by every trade form ─────────────────────────────────────── */

/**
 * The whole limit UX in one box: a price you type (or tap a ±% chip for),
 * with the live price right under it. No sliders, no trigger-distance math.
 */
export function PricePicker({
  label,
  current,
  quoteSymbol,
  value,
  setValue,
  chips,
}: {
  label: string;
  current: number | null;
  quoteSymbol: string;
  value: number | null;
  setValue: (v: number | null) => void;
  chips: number[];
}) {
  const [text, setText] = useState("");
  // keep the input text authoritative; chips overwrite it
  useEffect(() => {
    if (value == null && text !== "") setText("");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    setValue(raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null);
  };
  const chip = (p: number) => {
    if (current == null) return;
    const target = current * (1 + p / 100);
    const pretty = Number(target.toPrecision(6)).toString();
    setText(pretty);
    setValue(target);
  };
  const activeChip =
    current != null && value != null ? Math.round((value / current - 1) * 100) : null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="text-muted">
          now {current != null ? `${fmtPrice(current)} ${quoteSymbol}` : "—"}
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder={current != null ? fmtPrice(current) : "price"}
        value={text}
        onChange={(e) => apply(e.target.value)}
        className="w-full rounded border border-line bg-bg px-2 py-1.5 text-right text-sm tabular-nums focus:border-brand focus:outline-none"
      />
      <div className="mt-1 flex gap-1">
        {chips.map((p) => (
          <button
            key={p}
            onClick={() => chip(p)}
            className={`flex-1 rounded border px-1 py-0.5 text-[11px] ${
              activeChip === p
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

export function PctOfBalance({
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
          Exact approval covers only this order amount. Tokens stay in your wallet until execution.
        </div>
      )}
      {needsApproval ? (
        <button
          onClick={() => run(onApprove, "approving")}
          disabled={disabled || step !== "idle" || busy}
          className="monad-gradient w-full rounded py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {step === "approving" ? "Approving…" : "Approve"}
        </button>
      ) : (
        <button
          onClick={() => run(onPlace, "placing")}
          disabled={disabled || step !== "idle" || busy}
          className="monad-gradient w-full rounded py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {step === "placing" ? "Placing…" : placeLabel}
        </button>
      )}
    </div>
  );
}

export function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted">{k}</span>
      <span
        className={
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : ""
        }
      >
        {v}
      </span>
    </div>
  );
}

/** Shown when the pool is too fresh for the 60s TWAP a stop-loss needs. */
export function TwapWarning() {
  return (
    <div className="rounded border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn">
      This pool is too fresh for a 60s TWAP — a stop-loss here would revert on-chain. Try again
      once the pool has a minute of history.
    </div>
  );
}
