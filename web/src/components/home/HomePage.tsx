import { useNewPools, useTopPools, useTrendingPools } from "../../hooks/market.ts";
import { PoolTable } from "./PoolTable.tsx";
import { usePersistentState } from "../../lib/persist.ts";

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
  const [tab, setTab] = usePersistentState<TabId>("home-tab", "trending", (v) => TABS.some((t) => t.id === v));
  // Only the active tab polls — keeps us well inside gecko's free rate limit.
  const trending = useTrendingPools(tab === "trending");
  const fresh = useNewPools(tab === "new");
  const top = useTopPools(tab === "volume");
  const active = tab === "trending" ? trending : tab === "new" ? fresh : top;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-2.5 py-2.5 sm:px-3">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
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
