import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BridgeModal } from "./components/BridgeModal.tsx";
import { KlineChart } from "./components/KlineChart.tsx";
import { NetworkGuard } from "./components/NetworkGuard.tsx";
import { OrderSidebar } from "./components/OrderSidebar.tsx";
import { OrdersDock } from "./components/OrdersTables.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { TokenHeader } from "./components/TokenHeader.tsx";
import { TokenSearch } from "./components/TokenSearch.tsx";
import { useTerminal } from "./state/terminal.ts";

export default function App() {
  const { token } = useTerminal();
  const [bridgeOpen, setBridgeOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <NetworkGuard />
      {/* top bar */}
      <header className="flex items-center gap-4 border-b border-line px-4 py-2">
        <div className="text-sm font-bold tracking-tight">
          mono<span className="text-brand">limit</span>
        </div>
        <div className="w-96">
          <TokenSearch />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setBridgeOpen(true)}
            className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:border-brand hover:text-fg"
          >
            Bridge in ↗
          </button>
          <ConnectButton showBalance chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      {/* main */}
      <div className="min-h-0 flex-1">
        {token ? (
          <PanelGroup direction="horizontal">
            <Panel defaultSize={77} minSize={50}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={68} minSize={40}>
                  <div className="flex h-full flex-col">
                    <TokenHeader />
                    <div className="min-h-0 flex-1">
                      <KlineChart />
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
              mono<span className="text-brand">limit</span>
            </div>
            <p className="max-w-sm text-center text-sm text-muted">
              Non-custodial stop-losses, take-profits and sell ladders on Monad. Paste a token
              address above to open its terminal.
            </p>
          </div>
        )}
      </div>

      {bridgeOpen && <BridgeModal onClose={() => setBridgeOpen(false)} />}
      <Toasts />
    </div>
  );
}
