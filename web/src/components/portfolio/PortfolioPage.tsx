import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useActivity, usePortfolio } from "../../hooks/portfolio.ts";
import { STATUS, useUserOrders } from "../../hooks/orders.ts";
import { fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import { AssetsTable } from "./AssetsTable.tsx";
import { PortfolioSide } from "./PortfolioSide.tsx";

/**
 * Portfolio dashboard — every number is live: balances from a multicall over
 * the known Monad token universe, prices from GeckoTerminal, activity from
 * raw Transfer logs, open orders from the books. No mock data anywhere.
 */
export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [hidden, setHidden] = useState(false);
  const portfolio = usePortfolio();
  const activity = useActivity();
  const orders = useUserOrders();

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-lg font-semibold">Connect a wallet to see your portfolio</div>
        <div className="max-w-sm text-center text-xs text-muted">
          Balances, prices and activity are read live from Monad — nothing is stored.
        </div>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
            >
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  const p = portfolio.data;
  const openOrders = orders.data?.filter((o) => o.status === STATUS.Open).length;
  const up = (p?.change24hUsd ?? 0) >= 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3">
        {/* header card */}
        <div className="rounded-md border border-line bg-raised/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">My Portfolio</span>
            <span className="rounded bg-overlay px-1.5 py-0.5 text-[10px] text-muted">
              {address ? shortAddr(address) : ""}
            </span>
            <button
              onClick={() => setHidden((v) => !v)}
              aria-label={hidden ? "Show values" : "Hide values"}
              className="ml-auto flex size-6.5 items-center justify-center rounded-md border border-line text-muted hover:border-brand hover:text-fg"
            >
              <EyeGlyph off={hidden} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            {portfolio.isLoading ? (
              <span className="skeleton h-9 w-44 rounded" />
            ) : (
              <span className="text-3xl font-bold tabular-nums">
                {hidden ? "••••••" : fmtUsd(p?.totalUsd ?? 0)}
              </span>
            )}
            {p && p.change24hPct != null && (
              <span
                className={`pb-1 text-sm font-medium tabular-nums ${up ? "text-up" : "text-down"}`}
              >
                {hidden ? "•••" : `${up ? "+" : "−"}${fmtUsd(Math.abs(p.change24hUsd))}`} (
                {fmtPct(p.change24hPct)}) 24h
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
            <Stat
              label="24h P&L"
              value={
                p?.change24hPct == null
                  ? "—"
                  : hidden
                    ? "•••"
                    : `${up ? "+" : "−"}${fmtUsd(Math.abs(p.change24hUsd))}`
              }
              tone={p?.change24hPct == null ? undefined : up ? "up" : "down"}
            />
            <Stat label="Assets" value={p ? String(p.assets.length) : "—"} />
            <Stat label="Open orders" value={openOrders != null ? String(openOrders) : "—"} />
          </div>
        </div>

        {/* assets + right rail */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <AssetsTable
            assets={p?.assets ?? []}
            totalUsd={p?.totalUsd ?? 0}
            loading={portfolio.isLoading}
            hidden={hidden}
          />
          <PortfolioSide
            assets={p?.assets ?? []}
            totalUsd={p?.totalUsd ?? 0}
            activity={activity.data}
            activityLoading={activity.isLoading}
            hidden={hidden}
          />
        </div>

        <div className="text-center text-[10px] text-muted">
          Balances &amp; activity read live from Monad · prices from GeckoTerminal
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-md border border-line bg-bg/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EyeGlyph({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      {off && <path d="M4 16 16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}
