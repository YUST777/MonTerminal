import { useState } from "react";
import { BuyForm } from "./BuyForm.tsx";
import { LadderBuilder, StopLossForm, TakeProfitForm } from "./OrderForms.tsx";
import { useTerminal } from "../state/terminal.ts";

const TABS = ["Buy", "Take-profit", "Stop-loss", "Ladder"] as const;
type Tab = (typeof TABS)[number];

export function OrderSidebar() {
  const [tab, setTab] = useState<Tab>("Buy");
  const { token } = useTerminal();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-raised/40">
      <div className="grid grid-cols-4 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-1 py-1.5 text-[11px] font-medium ${
              tab === t
                ? "border-b border-brand text-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!token ? (
          <div className="p-3 text-center text-[11px] text-muted">
            Pick a token first — paste its address in the search bar.
          </div>
        ) : (
          <>
            {tab === "Buy" && <BuyForm />}
            {tab === "Take-profit" && <TakeProfitForm />}
            {tab === "Stop-loss" && <StopLossForm />}
            {tab === "Ladder" && <LadderBuilder />}
          </>
        )}
      </div>
    </div>
  );
}
