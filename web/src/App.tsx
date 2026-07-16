import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BridgeModal } from "./components/BridgeModal.tsx";
import { KlineChart } from "./components/KlineChart.tsx";
import { MarketBar } from "./components/MarketBar.tsx";
import { NetworkGuard } from "./components/NetworkGuard.tsx";
import { OrderSidebar } from "./components/OrderSidebar.tsx";
import { OrderBook } from "./components/OrderBook.tsx";
import { OrdersDock } from "./components/OrdersTables.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { TokenHeader } from "./components/TokenHeader.tsx";
import { TopNav } from "./components/TopNav.tsx";
import { useTerminal } from "./state/terminal.ts";
import { useUrlMarketSync } from "./hooks/market.ts";

export default function App() {
  const { token } = useTerminal();
  const [bridgeOpen, setBridgeOpen] = useState(false);
  useUrlMarketSync(); // /token/monad/0x… deep links ↔ selected market

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <NetworkGuard />
      <TopNav onBridge={() => setBridgeOpen(true)} />
      <MarketBar />
      <TokenHeader />

      {/* main */}
      <div className="min-h-0 flex-1">
        {token ? (
          <PanelGroup direction="horizontal">
            <Panel defaultSize={77} minSize={50}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={68} minSize={40}>
                  <div className="flex h-full">
                    <div className="min-w-0 flex-1">
                      <KlineChart />
                    </div>
                    <div className="w-56 shrink-0 border-l border-line">
                      <OrderBook />
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="resize-handle h-px bg-line" />
                <Panel defaultSize={32} minSize={15}>
                  <OrdersDock />
                </Panel>
              </PanelGroup>
            </Panel>
            <PanelResizeHandle className="resize-handle w-px bg-line" />
            <Panel defaultSize={23} minSize={16}>
              <OrderSidebar />
            </Panel>
          </PanelGroup>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="text-2xl font-bold">
              MONO<span className="text-brand">LIMIT</span>
            </div>
            <p className="max-w-sm text-center text-sm text-muted">
              Non-custodial stop-losses, take-profits and sell ladders on Monad. Open the market
              selector above and paste any token address.
            </p>
          </div>
        )}
      </div>

      {bridgeOpen && <BridgeModal onClose={() => setBridgeOpen(false)} />}
      <Toasts />
    </div>
  );
}
