import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { wagmiConfig } from "./config/wagmi.ts";
import { monad } from "@monolimit/shared";

const CHUNK_RELOAD_KEY = "monterminal:chunk-reload-at";

window.addEventListener("vite:preloadError", (event) => {
  const now = Date.now();
  try {
    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(lastReload) && now - lastReload < 15_000) return;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {}

  event.preventDefault();
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A tab switch shouldn't re-hit every API — polling intervals already
      // keep data live, and they pause on hidden tabs (refetchIntervalInBackground
      // defaults to false), so nothing goes stale silently.
      refetchOnWindowFocus: false,
      // One retry after 2s is plenty for free-tier APIs; the default 3 retries
      // with backoff triples the request count exactly when a host is limping.
      retry: 1,
      retryDelay: 2_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={monad}
          theme={darkTheme({
            accentColor: "#b2bcf1",
            accentColorForeground: "#12131a",
            borderRadius: "small",
          })}
        >
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
