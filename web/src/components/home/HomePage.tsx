import { useState } from "react";
import { useNewPools, useTopPools, useTrendingPools } from "../../hooks/market.ts";
import { PoolTable } from "./PoolTable.tsx";

const TABS = ["Trending", "New pairs", "Top volume"] as const;
type Tab = (typeof TABS)[number];

/**
 * GMGN-style discovery home — shown when no market is selected. Live token
 * lists straight from GeckoTerminal; a row click drops you into the terminal.
 */
export function HomePage() {
  const [tab, setTab] = useState<Tab>("Trending");
  // Only the active tab polls — keeps us well inside gecko's free rate limit.
  const trending = useTrendingPools(tab === "Trending");
  const fresh = useNewPools(tab === "New pairs");
  const top = useTopPools(tab === "Top volume");
  const active = tab === "Trending" ? trending : tab === "New pairs" ? fresh : top;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
        {/* hero — minimal, the table is the point */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="text-2xl font-bold">
            MONO<span className="text-brand">LIMIT</span>
          </div>
          <p className="max-w-md text-center text-sm text-muted">
            Non-custodial stop-losses, take-profits and sell ladders on Monad. Pick a token below
            or paste any address in the market selector above.
          </p>
        </div>

        {/* segmented list tabs */}
        <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-1 rounded-md border border-line bg-raised p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 text-[12px] font-semibold ${
                tab === t ? "bg-overlay text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <PoolTable
          pools={active.data}
          loading={active.isLoading}
          showAge={tab === "New pairs"}
        />

        <div className="text-center text-[11px] text-muted">
          Live from GeckoTerminal · Uniswap v3, Capricorn &amp; PancakeSwap v3
        </div>
      </div>
    </div>
  );
}
