import type { BurnAction } from "../../hooks/burner.ts";
import { fmtAmountNum, fmtUsd } from "../../lib/format.ts";
import { FlameGlyph } from "./BurnerPage.tsx";

const TITLE: Record<BurnAction, string> = {
  burn: "Burn Summary",
  sell: "Sell Summary",
  convert: "Convert Summary",
};
const CONFIRM: Record<BurnAction, string> = {
  burn: "Confirm Burn",
  sell: "Confirm Sell",
  convert: "Confirm Convert",
};
const NOTE: Record<BurnAction, string> = {
  burn: "All selected items will be permanently burned.",
  sell: "Selected tokens will be swapped to MON via Relay.",
  convert: "Selected tokens will be swapped to USDC via Relay.",
};

/** Live summary card — counts, value, gas-based fee estimate, receive line. */
export function BurnSummary({
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
    <div className="rounded-xl border border-line bg-raised/40 p-4">
      <div className="mb-3.5 flex items-center gap-2 text-[15px] font-semibold">
        <span className="text-brand">
          <FlameGlyph className="size-4" />
        </span>
        {TITLE[action]}
      </div>
      <div className="flex flex-col gap-3 text-[13px]">
        <Row label={`Tokens to ${action}`} value={String(count)} />
        <Row label="Estimated Value" value={fmtUsd(valueUsd)} />
        <Row
          label="Network Fees (est.)"
          info="Live gas price × one transfer per token"
          value={
            feeMon == null
              ? "—"
              : feeUsd != null
                ? fmtUsd(feeUsd)
                : `~${fmtAmountNum(feeMon)} MON`
          }
        />
      </div>
      <div className="mt-3.5 border-t border-line pt-3.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">You will receive</span>
          <span className="flex items-center gap-1.5 font-semibold tabular-nums">
            <img
              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png"
              alt=""
              className="size-4 rounded-full"
            />
            {receive}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] text-muted">{NOTE[action]}</div>
      </div>
      <button
        onClick={onConfirm}
        disabled={count === 0 || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-down py-2.5 text-sm font-semibold text-bg enabled:hover:opacity-90 disabled:opacity-40"
      >
        <FlameGlyph className="size-4" />
        {busy ? progress ?? "Working…" : CONFIRM[action]}
      </button>
    </div>
  );
}

/** Why burn? checklist — matches the reference copy line for line. */
export function WhyBurn() {
  return (
    <div className="rounded-xl border border-line bg-raised/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
        <span className="text-brand">
          <FlameGlyph className="size-4" />
        </span>
        Why burn?
      </div>
      <ul className="flex flex-col gap-2.5 text-xs text-muted">
        {[
          "Remove spam and clutter from your wallet",
          "Improve portfolio visibility and accuracy",
          "Protect against hidden approvals & risks",
          "Reclaim small value or burn forever",
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
  );
}

/** Slim horizontal safety banner under the table, like the reference. */
export function SafetyBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
        <ShieldGlyph />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">Safety First</div>
        <div className="truncate text-[11px] text-muted">
          We never ask for approvals to your wallet. Burner only uses read-only access and
          on-chain transactions you confirm.
        </div>
      </div>
      <a
        href="https://github.com/YUST777/monolimit#readme"
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-xs font-medium text-brand hover:underline"
      >
        Learn More ↗
      </a>
    </div>
  );
}

function Row({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-muted">
        {label}
        {info && (
          <span
            title={info}
            className="flex size-3.5 cursor-help items-center justify-center rounded-full border border-line text-[9px] text-muted"
          >
            i
          </span>
        )}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
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
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
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
