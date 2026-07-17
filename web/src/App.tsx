import { lazy, Suspense } from "react";
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
const BurnerPage = lazy(() =>
  import("./components/burner/BurnerPage.tsx").then((m) => ({ default: m.BurnerPage })),
);

export default function App() {
  const { token } = useTerminal();
  const path = usePathname();
  // Resizable panels need a mouse + width; under lg the terminal stacks.
  const desktop = useMediaQuery("(min-width: 1024px)");
  // /token/monad/0x… deep links ↔ selected market; true while a deep link is
  // still resolving on first load — show a boot loader, never flash the home page.
  const booting = useUrlMarketSync();

  if (booting) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-fg">
        <div className="text-xl font-bold">
          MONO<span className="monad-gradient-text">LIMIT</span>
        </div>
        <div className="spinner size-6" />
        <div className="text-xs text-muted">Loading market…</div>
      </div>
    );
  }

  const onBridge = path === "/bridge";
  const onPortfolio = path === "/portfolio";
  const onBurner = path === "/burner";
  const fullPage = onBridge || onPortfolio || onBurner;

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <NetworkGuard />
      <TopNav />
      {!fullPage && <MarketBar />}
      {!fullPage && <TokenHeader />}

      {/* main — Suspense fallback stays blank: each page paints its own skeletons */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
        {onBridge ? (
          <BridgePage />
        ) : onPortfolio ? (
          <PortfolioPage />
        ) : onBurner ? (
          <BurnerPage />
        ) : token ? (
          desktop ? (
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
            /* stacked mobile terminal — chart · trade panel · book · orders */
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="h-[45vh] min-h-72 shrink-0 border-b border-line">
                <KlineChart />
              </div>
              <div className="shrink-0 border-b border-line">
                <OrderSidebar />
              </div>
              <div className="h-80 shrink-0 border-b border-line">
                <OrderBook />
              </div>
              <div className="h-80 shrink-0 pb-4">
                <OrdersDock />
              </div>
            </div>
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
