import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MARKETS } from "@monolimit/shared";
import { shortAddr } from "../lib/format.ts";

const EXPLORER = "https://monadscan.com/address/";

/** Terminal-style top bar: logo · nav tabs · wallet / settings. */
export function TopNav({ onBridge }: { onBridge: () => void }) {
  return (
    <header className="flex h-11 items-center gap-5 border-b border-line bg-bg px-3">
      {/* logo block */}
      <a href="/" className="flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded bg-raised ring-1 ring-line">
          <LogoGlyph />
        </span>
        <span className="text-[13px] font-bold tracking-tight">
          MONO<span className="monad-gradient-text">LIMIT</span>
        </span>
      </a>

      {/* primary nav */}
      <nav className="flex items-center gap-0.5 text-[13px]">
        <NavItem active>Spot</NavItem>
        <NavItem onClick={onBridge}>Bridge</NavItem>
        <span className="mx-2 h-4 w-px bg-line" aria-hidden />
        <NavItem soon>Perp</NavItem>
        <NavItem soon>Vaults</NavItem>
        <NavItem soon>Portfolio</NavItem>
        <NavItem soon>Leaderboard</NavItem>
      </nav>

      {/* right cluster */}
      <div className="ml-auto flex items-center gap-2">
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <button
                onClick={
                  !connected ? openConnectModal : chain?.unsupported ? openChainModal : openAccountModal
                }
                className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 text-xs font-semibold hover:border-brand"
              >
                <WalletGlyph />
                {!connected
                  ? "Connect Wallet"
                  : chain?.unsupported
                    ? "Wrong network"
                    : (account.displayName ?? shortAddr(account.address))}
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
      className={`rounded px-2 py-1 transition-colors ${
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
        className={`flex size-6.5 items-center justify-center rounded-md border border-line hover:border-brand ${
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

/* inline glyphs — same mark as the favicon */

function LogoGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="size-4" fill="none" aria-hidden>
      <defs>
        <linearGradient id="monoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b2a6f7" />
          <stop offset="1" stopColor="#6656d6" />
        </linearGradient>
      </defs>
      <path
        d="M7 22V10l5 7 4-7 4 7 5-7v12"
        stroke="url(#monoGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" aria-hidden>
      <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" aria-hidden>
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
