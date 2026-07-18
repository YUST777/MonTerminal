import { TradePanel } from "./panel/TradePanel.tsx";
import { useTerminal } from "../state/terminal.ts";

export function OrderSidebar() {
  const { token } = useTerminal();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-raised/40">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!token ? (
          <div className="p-3 text-center text-[11px] text-muted">
            Pick a token first — open the market selector above.
          </div>
        ) : (
          <TradePanel />
        )}
      </div>
    </div>
  );
}
