import { usePersistentState } from "../../lib/persist.ts";
import { AutoLadder } from "./AutoLadder.tsx";
import { BuyLimit } from "./BuyLimit.tsx";
import { BuyMarket } from "./BuyMarket.tsx";
import { SellLimit } from "./SellLimit.tsx";
import { SellMarket } from "./SellMarket.tsx";

const TABS = ["Buy", "Sell", "Limit", "Auto"] as const;
type Tab = (typeof TABS)[number];
const LIMIT_SIDES = ["Buy", "Sell"] as const;
type LimitSide = (typeof LIMIT_SIDES)[number];

const TAB_TITLE: Record<Tab, string> = {
  Buy: "Instant buy",
  Sell: "Instant sell",
  Limit: "Buy the dip / stop-loss & take-profit — filled on-chain by keepers",
  Auto: "Laddered take-profits + stop-loss in one atomic tx",
};

/**
 * Trade panel: Buy | Sell | Limit | Auto. Buy and Sell are instant market
 * swaps; Limit holds both sides — Buy fills when the price drops to the
 * trigger, Sell is stop-loss (negative trigger) / take-profit (positive).
 * Auto places a GMGN-style sell ladder ("at 2× sell half") atomically.
 */
export function TradePanel() {
  const [tab, setTab] = usePersistentState<Tab>("panel-tab", "Buy", (v) => TABS.includes(v));
  const [limitSide, setLimitSide] = usePersistentState<LimitSide>("panel-limit-side", "Buy", (v) => LIMIT_SIDES.includes(v));

  return (
    <div>
      <div className="grid grid-cols-4 gap-1 border-b border-line p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            title={TAB_TITLE[t]}
            className={`rounded px-1 py-1 text-[11px] font-semibold ${
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
      {tab === "Buy" && <BuyMarket />}
      {tab === "Sell" && <SellMarket />}
      {tab === "Limit" && (limitSide === "Buy" ? <BuyLimit /> : <SellLimit />)}
      {tab === "Auto" && <AutoLadder />}
    </div>
  );
}
