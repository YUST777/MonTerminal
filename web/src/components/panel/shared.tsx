import { useState } from "react";
import { fmtAmount } from "../../lib/format.ts";
import { useToasts } from "../Toasts.tsx";

/* ── bits shared by every trade form ─────────────────────────────────────── */

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
          One-time approval lets the book pull tokens only when your trigger fires.
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
