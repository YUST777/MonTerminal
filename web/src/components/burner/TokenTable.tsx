import { useEffect, useMemo, useRef, useState } from "react";
import type { BurnAction, BurnerToken } from "../../hooks/burner.ts";
import { fmtAmountNum, fmtUsd } from "../../lib/format.ts";
import { TokenIcon } from "../TokenIcon.tsx";
import { FlameGlyph } from "./BurnerPage.tsx";

const GRID =
  "grid grid-cols-[28px_minmax(170px,1.6fr)_64px_1fr_0.9fr_0.8fr_minmax(170px,1.4fr)_36px] items-center gap-3";
const PAGE_SIZE = 5;
const MONAD_LOGO =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png";

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
  const allSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.address.toLowerCase()));
  const count = selected.size;

  return (
    <div>
      {/* filter row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="flex items-center gap-1.5 rounded-lg border border-line bg-overlay/40 px-3 py-1.5 text-xs font-medium">
          <img src={MONAD_LOGO} alt="" className="size-3.5 rounded-full" />
          Monad
        </span>
        <FilterChip
          label="Hide > $1"
          on={hideValuable}
          onClick={() => {
            setHideValuable((v) => !v);
            setPage(0);
          }}
        />
        <FilterChip
          label="Hide Whitelisted"
          badge="NEW"
          on={hideWhitelisted}
          onClick={() => {
            setHideWhitelisted((v) => !v);
            setPage(0);
          }}
        />
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-brand hover:text-fg"
        >
          Refresh <RefreshGlyph />
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted">
            {count} token{count === 1 ? "" : "s"} selected
          </span>
          <span className="text-xs">
            <span className="text-muted">Est. value:</span>{" "}
            <span className="font-semibold tabular-nums">{fmtUsd(selectedUsd)}</span>
          </span>
          <button
            onClick={onExecute}
            disabled={count === 0 || busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-bg enabled:hover:opacity-90 disabled:opacity-40"
          >
            <FlameGlyph className="size-3.5" />
            {busy
              ? progress ?? "Working…"
              : `${ACTION_LABEL[action]} ${count > 0 ? count : ""} Token${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {/* table head */}
      <div
        className={`${GRID} border-y border-line bg-overlay/30 px-4 py-2 text-[11px] font-medium text-muted`}
      >
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
        <span>Chain</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span />
        <span className="text-right">Action</span>
      </div>

      {loading && <SkeletonRows />}
      {!loading && filtered.length === 0 && (
        <div className="px-4 py-10 text-center text-xs text-muted">
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
            className={`${GRID} cursor-pointer border-b border-line/40 px-4 py-3 text-[13px] transition-colors ${
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
                <span className="truncate text-[13px] font-semibold">{t.name}</span>
                <span className="truncate text-[11px] text-muted">{t.symbol}</span>
              </span>
            </span>
            <span>
              <img
                src={MONAD_LOGO}
                alt="Monad"
                title="Monad"
                className="size-5 rounded-full"
              />
            </span>
            <span className="text-right tabular-nums">{fmtAmountNum(t.amount)}</span>
            <span className="text-right tabular-nums text-muted">
              {t.priceUsd != null ? fmtUsd(t.priceUsd) : "—"}
            </span>
            <span
              className={`text-right font-medium tabular-nums ${t.dust ? "text-down" : ""}`}
            >
              {t.priceUsd != null ? fmtUsd(t.valueUsd) : "—"}
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {t.dust && <Badge>&lt;$1</Badge>}
              {t.liquidityUsd != null && t.liquidityUsd > 0 ? (
                t.lowLiquidity && <Badge>Low Liquidity</Badge>
              ) : (
                <Badge>No Liquidity</Badge>
              )}
              {t.airdropped && !t.whitelisted && <Badge tone="down">Spam</Badge>}
            </span>
            <RowMenu token={t} />
          </div>
        );
      })}

      {/* pagination */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted">
          <span>
            Showing {safePage * PAGE_SIZE + 1} to{" "}
            {Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length} tokens
          </span>
          <Pagination page={safePage} pages={pages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

/** Numbered pager like the reference: ‹ 1 2 3 … N › */
function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  const nums: (number | "…")[] = [];
  if (pages <= 6) {
    for (let i = 0; i < pages; i++) nums.push(i);
  } else if (page < 3) {
    nums.push(0, 1, 2, "…", pages - 1);
  } else if (page > pages - 4) {
    nums.push(0, "…", pages - 3, pages - 2, pages - 1);
  } else {
    nums.push(0, "…", page, "…", pages - 1);
  }
  return (
    <div className="flex items-center gap-1">
      <PageBtn disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹
      </PageBtn>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1">
            …
          </span>
        ) : (
          <PageBtn key={n} active={n === page} onClick={() => onPage(n)}>
            {n + 1}
          </PageBtn>
        ),
      )}
      <PageBtn disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        ›
      </PageBtn>
    </div>
  );
}

function PageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex size-7 items-center justify-center rounded-md border text-xs transition-colors disabled:opacity-40 ${
        active
          ? "border-brand bg-brand/10 font-semibold text-fg"
          : "border-line enabled:hover:border-brand enabled:hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  label,
  badge,
  on,
  onClick,
}: {
  label: string;
  badge?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        on ? "border-brand/50 bg-brand/10 text-fg" : "border-line text-muted hover:text-fg"
      }`}
    >
      {label}
      {badge && (
        <span className="rounded bg-brand px-1 py-px text-[9px] font-bold text-bg">{badge}</span>
      )}
      {on && <span className="text-[9px] text-brand">✓</span>}
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "down" }) {
  return (
    <span
      className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        tone === "down" ? "bg-down/10 text-down" : "bg-overlay text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** ⋮ per-row menu — explorer link + copy address. */
function RowMenu({ token }: { token: BurnerToken }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Token actions"
        className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-overlay hover:text-fg"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-line bg-overlay p-1 text-xs shadow-2xl">
          <a
            href={`https://monadscan.com/token/${token.address}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md px-2.5 py-1.5 hover:bg-raised"
          >
            View on Monadscan ↗
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(token.address);
              setOpen(false);
            }}
            className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-raised"
          >
            Copy address
          </button>
        </div>
      )}
    </div>
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
              <span className="skeleton h-3 w-24 rounded" />
              <span className="skeleton h-2 w-12 rounded" />
            </span>
          </span>
          <span className="skeleton size-5 rounded-full" />
          {Array.from({ length: 3 }, (_, j) => (
            <span key={j} className="flex justify-end">
              <span className="skeleton h-3 w-14 rounded" />
            </span>
          ))}
          <span className="flex justify-end">
            <span className="skeleton h-4 w-20 rounded" />
          </span>
          <span />
        </div>
      ))}
    </>
  );
}
