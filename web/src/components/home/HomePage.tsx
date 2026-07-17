import { useState } from "react";
import { useNewPools, useTopPools, useTrendingPools } from "../../hooks/market.ts";
import { PoolTable } from "./PoolTable.tsx";

const TABS = [
  { id: "trending", label: "🔥 Trending" },
  { id: "new", label: "🌱 New pairs" },
  { id: "volume", label: "📊 Top volume" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * GMGN-style discovery home — shown when no market is selected. Full-width
 * dense token table, live from GeckoTerminal; a row click opens the terminal.
 */
export function HomePage() {
  const [tab, setTab] = useState<TabId>("trending");
  // Only the active tab polls — keeps us well inside gecko's free rate limit.
  const trending = useTrendingPools(tab === "trending");
  const fresh = useNewPools(tab === "new");
  const top = useTopPools(tab === "volume");
  const active = tab === "trending" ? trending : tab === "new" ? fresh : top;

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "bg-raised text-fg ring-1 ring-line" : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <PoolTable pools={active.data} loading={active.isLoading} />
    </div>
  );
}
