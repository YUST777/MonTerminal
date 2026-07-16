import { useState } from "react";
import { AutoLadder } from "./AutoLadder.tsx";
import { BuyMarket } from "./BuyMarket.tsx";
import { SellLimit } from "./SellLimit.tsx";
import { SellMarket } from "./SellMarket.tsx";

const TABS = ["Buy", "Sell", "Auto"] as const;
type Tab = (typeof TABS)[number];
const SELL_MODES = ["Market", "Limit"] as const;
type SellMode = (typeof SELL_MODES)[number];

const TAB_TITLE: Record<Tab, string> = {
  Buy: "Instant buy via Relay",
  Sell: "Sell now or at a trigger price",
  Auto: "Laddered take-profits + stop, one tx",
};

/**
 * GMGN-style trade panel: Buy | Sell | Auto. Sell splits into Market (instant
 * via Relay) and Limit (one form — negative trigger = stop-loss, positive =
 * take-profit). Auto is the ladder builder.
 */
export function TradePanel() {
  const [tab, setTab] = useState<Tab>("Buy");
  const [sellMode, setSellMode] = useState<SellMode>("Market");

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 border-b border-line p-1.5">
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
      {tab === "Sell" && (
        <div className="grid grid-cols-2 gap-1 px-2.5 pt-2">
          {SELL_MODES.map((m) => (
            <button
              key={m}
              onClick={() => setSellMode(m)}
              className={`rounded px-1 py-0.5 text-[11px] font-semibold ${
                sellMode === m ? "bg-overlay text-fg" : "text-muted hover:bg-raised hover:text-fg"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {tab === "Buy" && <BuyMarket />}
      {tab === "Sell" && (sellMode === "Market" ? <SellMarket /> : <SellLimit />)}
      {tab === "Auto" && <AutoLadder />}
    </div>
  );
}
