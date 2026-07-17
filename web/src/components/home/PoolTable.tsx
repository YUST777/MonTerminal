import { useState } from "react";
import { usePublicClient } from "wagmi";
import { MARKETS, monad } from "@monolimit/shared";
import { lookupTopPool, useOnchainIcons, usePairsMedia } from "../../hooks/market.ts";
import type { TopPool } from "../../lib/gecko.ts";
import { fmtAge, fmtAmountNum, fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { TokenIcon } from "../TokenIcon.tsx";
import { useToasts } from "../Toasts.tsx";

const GRID =
  "grid grid-cols-[minmax(180px,2.4fr)_0.7fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.7fr] items-center gap-2";

/** GMGN-style dense token table: click a row to open it in the terminal. */
export function PoolTable({ pools, loading }: { pools: TopPool[] | undefined; loading: boolean }) {
  const client = usePublicClient({ chainId: monad.id });
  const setMarket = useTerminal((s) => s.setMarket);
  const push = useToasts((s) => s.push);
  const [resolving, setResolving] = useState<string | null>(null);
  // DexScreener icons fill the gaps in gecko's base_token sideload;
  // brand-new launchpad tokens resolve via on-chain getTokenInfo()
  const { data: media } = usePairsMedia(pools?.map((p) => p.address));
  const { data: chainIcons } = useOnchainIcons(pools?.map((p) => p.baseToken));

  const pick = async (p: TopPool) => {
    if (!client || resolving) return;
    setResolving(p.address);
    try {
      // lookupTopPool routes rows on unsupported DEXes (nad.fun & co.)
      // through the token's deepest supported pool automatically.
      const r = await lookupTopPool(client, p);
      setMarket(r.token, r.pool);
    } catch (err) {
      push("error", (err as Error).message.slice(0, 140));
    } finally {
      setResolving(null);
    }
  };

  return (
    // On narrow screens the 10-col grid scrolls sideways as one unit
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden rounded-md border border-line bg-raised/40">
      <div className="flex min-h-0 min-w-[880px] flex-1 flex-col">
      <div
        className={`${GRID} border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted`}
      >
        <span>Token</span>
        <span className="text-right">Age</span>
        <span className="text-right">Price</span>
        <span className="text-right">5m</span>
        <span className="text-right">1h</span>
        <span className="text-right">24h</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Liq</span>
        <span className="text-right">MC</span>
        <span className="text-right">Txs</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !pools && <SkeletonRows />}
        {!loading && (pools?.length ?? 0) === 0 && (
          <div className="px-3 py-4 text-xs text-muted">
            No pools indexed yet — paste a token address in the market selector above.
          </div>
        )}
        {(pools ?? []).map((p) => {
          const market = MARKETS.find((m) => m.dexId === p.dexId);
          const busy = resolving === p.address;
          return (
            <button
              key={p.address}
              onClick={() => pick(p)}
              disabled={!!resolving}
              className={`${GRID} w-full border-b border-line/40 px-3 py-2 text-left text-[13px] transition-colors hover:bg-raised disabled:opacity-60`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <TokenIcon
                  url={
                    media?.get(p.address.toLowerCase()) ??
                    p.imageUrl ??
                    chainIcons?.get(p.baseToken.toLowerCase())
                  }
                  symbol={p.baseSymbol}
                  size="size-7"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{p.baseSymbol}</span>
                    <span className="truncate text-[11px] text-muted">/{p.quoteSymbol}</span>
                    {busy && <span className="spinner size-3 shrink-0" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span>{shortAddr(p.baseToken)}</span>
                    <span className="rounded bg-overlay px-1 py-px text-[8px] font-medium uppercase">
                      {(market?.label ?? p.dexId.replace(/-monad$/, "").replace(/-/g, " ")).split(
                        " ",
                      )[0] || "?"}
                    </span>
                  </span>
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-muted">
                {p.createdAtSec != null ? fmtAge(p.createdAtSec) : "—"}
              </span>
              <span className="text-right tabular-nums">
                {p.priceUsd != null ? fmtUsd(p.priceUsd) : "—"}
              </span>
              <PctCell v={p.change5mPct} />
              <PctCell v={p.change1hPct} />
              <PctCell v={p.change24hPct} />
              <span className="text-right tabular-nums">{fmtUsd(p.volume24hUsd)}</span>
              <span className="text-right tabular-nums text-muted">{fmtUsd(p.reserveUsd)}</span>
              <span className="text-right tabular-nums text-muted">
                {p.fdvUsd != null ? fmtUsd(p.fdvUsd) : "—"}
              </span>
              <span className="text-right tabular-nums text-muted">
                {p.txns24h != null ? fmtAmountNum(p.txns24h, 0) : "—"}
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function PctCell({ v }: { v: number | null }) {
  return (
    <span
      className={`text-right text-xs font-medium tabular-nums ${
        v == null ? "text-muted" : v >= 0 ? "text-up" : "text-down"
      }`}
    >
      {v != null ? fmtPct(v) : "—"}
    </span>
  );
}

/** Shimmer placeholder rows shown only on first (uncached) load. */
function SkeletonRows({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${GRID} border-b border-line/40 px-3 py-2`}>
          <span className="flex items-center gap-2.5">
            <span className="skeleton size-7 shrink-0 rounded-full" />
            <span className="flex flex-col gap-1">
              <span className="skeleton h-3 w-24 rounded" />
              <span className="skeleton h-2 w-16 rounded" />
            </span>
          </span>
          {Array.from({ length: 9 }, (_, j) => (
            <span key={j} className="flex justify-end">
              <span className="skeleton h-3 w-10 rounded" />
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
