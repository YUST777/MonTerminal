import { useMemo, useState } from "react";
import type { BurnAction, BurnerToken } from "../../hooks/burner.ts";
import { fmtAmountNum, fmtUsd, shortAddr } from "../../lib/format.ts";
import { TokenIcon } from "../TokenIcon.tsx";

const GRID =
  "grid grid-cols-[28px_minmax(160px,1.6fr)_1fr_0.9fr_0.9fr_minmax(150px,1.3fr)_36px] items-center gap-3";
const PAGE_SIZE = 5;

const ACTION_LABEL: Record<BurnAction, string> = {
  burn: "Burn",
  sell: "Sell",
  convert: "Convert",
};

/** Tokens tab — filters, select-all checkbox table with risk badges, pagination. */
export function TokenTable({
  tokens,
  loading,
  selected,
  selectedUsd,
  action,
  busy,
  progress,
  onToggle,
  onSetMany,
  onRefresh,
  onExecute,
}: {
  tokens: BurnerToken[];
  loading: boolean;
  selected: Set<string>;
  selectedUsd: number;
  action: BurnAction;
  busy: boolean;
  progress: string | null;
  onToggle: (t: BurnerToken) => void;
  onSetMany: (keys: string[], on: boolean) => void;
  onRefresh: () => void;
  onExecute: () => void;
}) {
  const [hideValuable, setHideValuable] = useState(true);
  const [hideWhitelisted, setHideWhitelisted] = useState(true);
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () =>
      tokens.filter(
        (t) => (!hideValuable || t.valueUsd < 1) && (!hideWhitelisted || !t.whitelisted),
      ),
    [tokens, hideValuable, hideWhitelisted],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.address.toLowerCase()));
  const count = selected.size;

  return (
    <div>
      {/* filter row */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-muted">
          Monad
        </span>
        <Toggle
          label="Hide > $1"
          on={hideValuable}
          onClick={() => {
            setHideValuable((v) => !v);
            setPage(0);
          }}
        />
        <Toggle
          label="Hide Whitelisted"
          on={hideWhitelisted}
          onClick={() => {
            setHideWhitelisted((v) => !v);
            setPage(0);
          }}
        />
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-muted hover:border-brand hover:text-fg"
        >
          <RefreshGlyph /> Refresh
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {count > 0 && (
            <span className="text-[11px] text-muted">
              {count} token{count > 1 ? "s" : ""} selected · Est value {fmtUsd(selectedUsd)}
            </span>
          )}
          <button
            onClick={onExecute}
            disabled={count === 0 || busy}
            className="rounded-md bg-down px-3 py-1.5 text-xs font-semibold text-bg enabled:hover:opacity-90 disabled:opacity-40"
          >
            {busy
              ? progress ?? "Working…"
              : `${ACTION_LABEL[action]} ${count > 0 ? count : ""} Token${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {/* table head */}
      <div className={`${GRID} border-b border-line px-4 py-2 text-[11px] font-medium text-muted`}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() =>
            onSetMany(
              filtered.map((t) => t.address.toLowerCase()),
              !allSelected,
            )
          }
          className="size-3.5 accent-(--color-brand)"
        />
        <span>Token</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span>Flags</span>
        <span />
      </div>

      {loading && <SkeletonRows />}
      {!loading && filtered.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-muted">
          {tokens.length === 0
            ? "No tokens found in this wallet on Monad."
            : "Nothing matches the filters — this wallet looks clean. 🧹"}
        </div>
      )}

      {rows.map((t) => {
        const key = t.address.toLowerCase();
        const checked = selected.has(key);
        return (
          <div
            key={key}
            onClick={() => onToggle(t)}
            className={`${GRID} cursor-pointer border-b border-line/40 px-4 py-3 text-[13px] transition-colors last:border-b-0 ${
              checked ? "bg-brand/5" : "hover:bg-overlay/40"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(t)}
              onClick={(e) => e.stopPropagation()}
              className="size-3.5 accent-(--color-brand)"
            />
            <span className="flex min-w-0 items-center gap-2.5">
              <TokenIcon url={t.logo} symbol={t.symbol} size="size-8" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold">{t.symbol}</span>
                <span className="truncate text-[11px] text-muted">{t.name}</span>
              </span>
            </span>
            <span className="text-right tabular-nums">{fmtAmountNum(t.amount)}</span>
            <span className="text-right tabular-nums text-muted">
              {t.priceUsd != null ? fmtUsd(t.priceUsd) : "—"}
            </span>
            <span className="text-right font-medium tabular-nums">
              {t.priceUsd != null ? fmtUsd(t.valueUsd) : "—"}
            </span>
            <span className="flex flex-wrap gap-1">
              {t.airdropped && !t.whitelisted && <Badge tone="down">Spam</Badge>}
              {t.lowLiquidity && <Badge tone="warn">Low Liquidity</Badge>}
              {t.dust && <Badge>&lt; $1</Badge>}
            </span>
            <a
              href={`https://monadscan.com/token/${t.address}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={shortAddr(t.address)}
              className="text-center text-muted hover:text-brand"
            >
              ↗
            </a>
          </div>
        );
      })}

      {/* pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 text-[11px] text-muted">
          <span>
            Showing {safePage * PAGE_SIZE + 1}–
            {Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <PageBtn label="‹" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} />
            <PageBtn
              label="›"
              disabled={safePage >= pages - 1}
              onClick={() => setPage(safePage + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-muted hover:text-fg"
    >
      <span
        className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-brand" : "bg-overlay"
        }`}
      >
        <span
          className={`size-2.5 rounded-full bg-bg transition-transform ${on ? "translate-x-2.5" : ""}`}
        />
      </span>
      {label}
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "down" | "warn" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        tone === "down"
          ? "bg-down/10 text-down"
          : tone === "warn"
            ? "bg-[#ffd58a]/10 text-[#ffd58a]"
            : "bg-overlay text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function PageBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex size-6 items-center justify-center rounded-md border border-line enabled:hover:border-brand enabled:hover:text-fg disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function RefreshGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-3" fill="none" aria-hidden>
      <path
        d="M16 10a6 6 0 1 1-1.8-4.3M16 3v3.5h-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${GRID} border-b border-line/40 px-4 py-3`}>
          <span className="skeleton size-3.5 rounded" />
          <span className="flex items-center gap-2.5">
            <span className="skeleton size-8 shrink-0 rounded-full" />
            <span className="flex flex-col gap-1">
              <span className="skeleton h-3 w-16 rounded" />
              <span className="skeleton h-2 w-24 rounded" />
            </span>
          </span>
          {Array.from({ length: 4 }, (_, j) => (
            <span key={j} className="flex justify-end">
              <span className="skeleton h-3 w-12 rounded" />
            </span>
          ))}
          <span />
        </div>
      ))}
    </>
  );
}
