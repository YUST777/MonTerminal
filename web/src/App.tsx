import { lazy, Suspense, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { HomePage } from "./components/home/HomePage.tsx";
import { KlineChart } from "./components/KlineChart.tsx";
import { MarketBar } from "./components/MarketBar.tsx";
import { NetworkGuard } from "./components/NetworkGuard.tsx";
import { OrderSidebar } from "./components/OrderSidebar.tsx";
import { OrderBook } from "./components/OrderBook.tsx";
import { OrdersDock } from "./components/OrdersTables.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { TokenHeader } from "./components/TokenHeader.tsx";
import { TokenOverview } from "./components/TokenOverview.tsx";
import { TopNav } from "./components/TopNav.tsx";
import { useTerminal } from "./state/terminal.ts";
import { useUrlMarketSync } from "./hooks/market.ts";
import { useMediaQuery } from "./hooks/media.ts";
import { usePathname } from "./lib/router.ts";

// Secondary routes load on demand — the landing page ships without their code.
const BridgePage = lazy(() =>
  import("./components/bridge/BridgePage.tsx").then((m) => ({ default: m.BridgePage })),
);
const PortfolioPage = lazy(() =>
  import("./components/portfolio/PortfolioPage.tsx").then((m) => ({ default: m.PortfolioPage })),
);

export default function App() {
  const { token, pool } = useTerminal();
  const path = usePathname();
  // Resizable panels need a mouse + width; under lg the terminal stacks.
  const desktop = useMediaQuery("(min-width: 1024px)");
  // /token/monad/0x… deep links ↔ selected market; true while a deep link is
  // still resolving on first load — show a boot loader, never flash the home page.
  const { resolving: booting, error: marketError } = useUrlMarketSync();

  if (booting) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-fg">
        <div className="text-xl font-bold">
          Mon<span className="monad-gradient-text">Terminal</span>
        </div>
        <div className="spinner size-6" />
        <div className="text-xs text-muted">Loading market…</div>
      </div>
    );
  }

  const onBridge = path === "/bridge" || path === "/swap";
  const onPortfolio = path === "/portfolio";
  // "/" is ALWAYS the home page — a selected token only means the terminal
  // when the URL says so (logo → home works even mid-trade).
  const onTerminal = path.startsWith("/token/") && (!!token || !!marketError);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-fg lg:pb-0">
      <NetworkGuard />
      <TopNav />
      {/* market selector + favorites live on every page — one-click hop to any coin */}
      <MarketBar />
      {onTerminal && token && <TokenHeader />}

      {/* main — Suspense fallback stays blank: each page paints its own skeletons */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
        {onBridge ? (
          <BridgePage />
        ) : onPortfolio ? (
          <PortfolioPage />
        ) : onTerminal ? (
          marketError ? (
            <TokenOverview error={marketError} />
          ) : !pool ? (
            <TokenOverview />
          ) : desktop ? (
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
            <MobileTerminal />
          )
        ) : (
          <HomePage />
        )}
        </Suspense>
      </div>

      <Toasts />
    </div>
  );
}

type MobileTerminalPanel = "Trade" | "Book" | "Orders";

function MobileTerminal() {
  const [panel, setPanel] = useState<MobileTerminalPanel>("Trade");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={`shrink-0 border-b border-line transition-[height] duration-200 ${
          panel === "Trade"
            ? "h-[clamp(180px,25svh,230px)]"
            : "h-[clamp(220px,34svh,340px)]"
        }`}
      >
        <KlineChart />
      </div>
      <div className="shrink-0 border-b border-line bg-raised/35 p-1">
        <div className="grid grid-cols-3 rounded-lg bg-bg p-1 ring-1 ring-line/80">
          {(["Trade", "Book", "Orders"] as MobileTerminalPanel[]).map((item) => (
            <button
              key={item}
              onClick={() => setPanel(item)}
              className={`rounded-md py-1 text-[11px] font-semibold transition-colors ${
                panel === item ? "bg-overlay text-fg" : "text-muted"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className={`min-h-0 flex-1 overscroll-contain ${panel === "Trade" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {panel === "Trade" && <OrderSidebar compact />}
        {panel === "Book" && <div className="h-full min-h-[420px]"><OrderBook /></div>}
        {panel === "Orders" && <div className="h-full min-h-[360px]"><OrdersDock /></div>}
      </div>
    </div>
  );
}
