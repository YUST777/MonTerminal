import type { BurnAction } from "../../hooks/burner.ts";
import { fmtAmountNum, fmtUsd } from "../../lib/format.ts";

const CONFIRM_LABEL: Record<BurnAction, string> = {
  burn: "Confirm Burn",
  sell: "Confirm Sell",
  convert: "Confirm Convert",
};
const RECEIVE_LABEL: Record<BurnAction, string> = {
  burn: "You will receive",
  sell: "You will receive (est.)",
  convert: "You will receive (est.)",
};

/** Right rail: live burn summary, the why-burn checklist and a safety note. */
export function BurnerRail({
  action,
  count,
  valueUsd,
  feeMon,
  monUsd,
  busy,
  progress,
  onConfirm,
}: {
  action: BurnAction;
  count: number;
  valueUsd: number;
  /** total network fee across the selected txs, in MON */
  feeMon: number | null;
  monUsd: number | null;
  busy: boolean;
  progress: string | null;
  onConfirm: () => void;
}) {
  const feeUsd = feeMon != null && monUsd != null ? feeMon * monUsd : null;
  const receive =
    action === "burn"
      ? "0 MON"
      : action === "sell"
        ? monUsd != null && monUsd > 0
          ? `~${fmtAmountNum(valueUsd / monUsd)} MON`
          : "—"
        : `~${fmtUsd(valueUsd)} USDC`;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-raised/40 p-4">
        <div className="mb-3 text-[15px] font-semibold">
          {action === "burn" ? "Burn" : action === "sell" ? "Sell" : "Convert"} Summary
        </div>
        <div className="flex flex-col gap-2.5 text-[13px]">
          <Row label={`Tokens to ${action}`} value={String(count)} />
          <Row label="Est. Value" value={fmtUsd(valueUsd)} />
          <Row
            label="Network fees"
            value={
              feeMon == null
                ? "—"
                : `~${fmtAmountNum(feeMon)} MON${feeUsd != null ? ` (${fmtUsd(feeUsd)})` : ""}`
            }
          />
          <div className="border-t border-line pt-2.5">
            <Row label={RECEIVE_LABEL[action]} value={receive} strong />
          </div>
        </div>
        <button
          onClick={onConfirm}
          disabled={count === 0 || busy}
          className="mt-4 w-full rounded-lg bg-down py-2.5 text-sm font-semibold text-bg enabled:hover:opacity-90 disabled:opacity-40"
        >
          {busy ? progress ?? "Working…" : CONFIRM_LABEL[action]}
        </button>
        {action === "burn" && count > 0 && !busy && (
          <div className="mt-2 text-center text-[10px] text-muted">
            Burning is permanent — tokens go to 0x…dEaD and can never come back.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-raised/40 p-4">
        <div className="mb-3 text-[15px] font-semibold">Why burn?</div>
        <ul className="flex flex-col gap-2.5 text-xs text-muted">
          {[
            "Declutter your wallet from spam and dust",
            "Remove scam airdrops you never asked for",
            "Reduce phishing risk from malicious tokens",
            "One clean portfolio view of what matters",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-up/15 text-up">
                <CheckGlyph />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
        <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
          <ShieldGlyph /> Safety First
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Burns are plain ERC-20 transfers signed by your own wallet — MonoLimit never takes
          custody and can't move anything without your signature. Whitelisted tokens are
          hidden by default so you don't torch something valuable by accident.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-2.5" fill="none" aria-hidden>
      <path
        d="m4.5 10.5 3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-brand" fill="none" aria-hidden>
      <path
        d="M10 2.5 4 5v5c0 3.5 2.5 6.2 6 7.5 3.5-1.3 6-4 6-7.5V5l-6-2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m7.5 10 1.8 1.8 3.2-3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
