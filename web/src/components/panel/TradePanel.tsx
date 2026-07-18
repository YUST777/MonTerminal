import { useEffect } from "react";
import { usePersistentState } from "../../lib/persist.ts";
import { BuyLimit } from "./BuyLimit.tsx";
import { BuyMarket } from "./BuyMarket.tsx";
import { SellLimit } from "./SellLimit.tsx";
import { SellMarket } from "./SellMarket.tsx";
import { SmartOrders } from "./SmartOrders.tsx";

const TABS = ["Buy", "Sell", "Limit", "AI"] as const;
type Tab = (typeof TABS)[number];
const LIMIT_SIDES = ["Buy", "Sell"] as const;
type LimitSide = (typeof LIMIT_SIDES)[number];

const TAB_TITLE: Record<Tab, string> = {
  Buy: "Instant buy",
  Sell: "Instant sell",
  Limit: "Buy the dip / stop-loss & take-profit — filled on-chain by keepers",
  AI: "Describe a buy/sell plan in plain language, review it, then place atomically",
};

/**
 * Trade panel: Buy | Sell | Limit | AI. Buy and Sell are instant market
 * swaps; Limit holds both sides — Buy fills when the price drops to the
 * trigger, Sell is stop-loss (negative trigger) / take-profit (positive).
 * AI translates natural language into the same deterministic on-chain orders.
 */
export function TradePanel() {
  const [tab, setTab] = usePersistentState<Tab>("panel-tab", "Buy", (v) => TABS.includes(v));
  const [limitSide, setLimitSide] = usePersistentState<LimitSide>("panel-limit-side", "Buy", (v) => LIMIT_SIDES.includes(v));

  useEffect(() => {
    const openTab = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (typeof next === "string" && TABS.includes(next as Tab)) setTab(next as Tab);
    };
    window.addEventListener("monterminal:trade-tab", openTab);
    return () => window.removeEventListener("monterminal:trade-tab", openTab);
  }, [setTab]);

  return (
    <div className="p-2 pb-0">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-bg p-1 ring-1 ring-line/80">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            title={TAB_TITLE[t]}
            className={`rounded-md px-1 py-1 text-[11px] font-semibold transition-colors ${
              tab === t
                ? t === "Buy"
                  ? "bg-up/15 text-up"
                  : t === "Sell"
                    ? "bg-down/15 text-down"
                    : "bg-overlay text-fg"
                : "text-muted hover:bg-raised hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Limit" && (
        <div className="grid grid-cols-2 gap-1 px-2.5 pt-2">
          {LIMIT_SIDES.map((s) => (
            <button
              key={s}
              onClick={() => setLimitSide(s)}
              className={`rounded px-1 py-0.5 text-[11px] font-semibold ${
                limitSide === s
                  ? s === "Buy"
                    ? "bg-up/15 text-up"
                    : "bg-down/15 text-down"
                  : "text-muted hover:bg-raised hover:text-fg"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="-mx-2">
      {tab === "Buy" && <BuyMarket />}
      {tab === "Sell" && <SellMarket />}
      {tab === "Limit" && (limitSide === "Buy" ? <BuyLimit /> : <SellLimit />)}
      {tab === "AI" && <SmartOrders />}
      </div>
    </div>
  );
}
