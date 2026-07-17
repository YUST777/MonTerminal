import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MARKETS } from "@monolimit/shared";
import { shortAddr } from "../lib/format.ts";
import { loadPersisted } from "../lib/persist.ts";
import { navigate, usePathname } from "../lib/router.ts";
import { useTerminal } from "../state/terminal.ts";

const EXPLORER = "https://monadscan.com/address/";

/** Terminal-style top bar: logo · nav tabs · wallet / settings. */
export function TopNav() {
  const path = usePathname();
  const token = useTerminal((s) => s.token);
  const onBridge = path === "/bridge" || path === "/swap";
  const onPortfolio = path === "/portfolio";
  // "Spot" returns to the selected market — or, after a reload, the last one
  // this browser traded (deep-linking re-resolves the pool fresh) — else home.
  const lastMarket = token ?? loadPersisted<{ address: string }>("last-market");
  const spotPath = lastMarket ? `/token/monad/${lastMarket.address.toLowerCase()}` : "/";

  return (
    <header className="flex h-14 items-center gap-2.5 border-b border-line bg-bg px-3 sm:gap-6 sm:px-5">
      {/* logo — always goes home */}
      <button onClick={() => navigate("/")} className="flex shrink-0 items-baseline">
        <span className="text-[18px] font-bold tracking-tight">
          Mono<span className="monad-gradient-text">Limit</span>
        </span>
      </button>

      {/* primary nav — scrolls sideways instead of wrapping on tiny screens */}
      <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavItem active={!onBridge && !onPortfolio} onClick={() => navigate(spotPath)}>
          Spot
        </NavItem>
        <NavItem active={onBridge} onClick={() => navigate("/swap")}>
          Swap · Bridge
        </NavItem>
        <NavItem active={onPortfolio} onClick={() => navigate("/portfolio")}>
          Portfolio
        </NavItem>
      </nav>

      {/* right cluster */}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <button
                onClick={
                  !connected ? openConnectModal : chain?.unsupported ? openChainModal : openAccountModal
                }
                className="flex items-center gap-2 whitespace-nowrap rounded-md border border-line bg-raised px-3.5 py-1.5 text-[13px] font-semibold hover:border-brand"
              >
                <WalletGlyph />
                {!connected ? (
                  <>
                    <span className="sm:hidden">Connect</span>
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </>
                ) : chain?.unsupported ? (
                  "Wrong network"
                ) : (
                  (account.displayName ?? shortAddr(account.address))
                )}
              </button>
            );
          }}
        </ConnectButton.Custom>
        <SettingsMenu />
      </div>
    </header>
  );
}

function NavItem({
  children,
  active,
  soon,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  soon?: boolean;
  onClick?: () => void;
}) {
  if (soon) {
    return (
      <span
        title="Coming soon"
        className="cursor-not-allowed rounded px-2 py-1 text-muted/50 select-none"
      >
        {children}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 transition-colors ${
        active ? "bg-overlay font-semibold text-fg" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** Gear popover — deployed books + explorer links (verifiable, non-custodial). */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        className={`flex size-8 items-center justify-center rounded-md border border-line hover:border-brand ${
          open ? "bg-overlay text-fg" : "text-muted hover:text-fg"
        }`}
      >
        <GearGlyph />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-line bg-overlay p-2 text-[11px] shadow-2xl">
          <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted">
            On-chain books (immutable)
          </div>
          {MARKETS.map((m) => (
            <a
              key={m.dexId}
              href={`${EXPLORER}${m.book}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-raised"
            >
              <span>{m.label}</span>
              <span className="text-muted">{shortAddr(m.book)} ↗</span>
            </a>
          ))}
          <div className="mt-1.5 border-t border-line pt-1.5 text-muted">
            Non-custodial — tokens stay in your wallet until a trigger fires.
          </div>
        </div>
      )}
    </div>
  );
}

/* inline glyphs */

function WalletGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
      <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
