import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  ChartLine,
  Compass,
  ShieldCheck,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { MARKETS } from "@monolimit/shared";
import { shortAddr } from "../lib/format.ts";
import { loadPersisted, savePersisted } from "../lib/persist.ts";
import { navigate, usePathname } from "../lib/router.ts";
import { useTerminal } from "../state/terminal.ts";

const EXPLORER = "https://monadscan.com/address/";
const DEFAULT_PAIR_PATH = "/token/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777";

/** Compact identity/wallet bar with the primary product dock fixed below. */
export function TopNav() {
  const path = usePathname();
  const token = useTerminal((s) => s.token);
  const onBridge = path === "/bridge" || path === "/swap";
  const onPortfolio = path === "/portfolio";
  const onProof = path === "/proof";
  const onPair = path.startsWith("/token/");
  // "Spot" returns to the selected market — or, after a reload, the last one
  // this browser traded (deep-linking re-resolves the pool fresh) — else home.
  const lastMarket = token ?? loadPersisted<{ address: string }>("last-market");
  const pairPath = lastMarket
    ? `/token/monad/${lastMarket.address.toLowerCase()}`
    : DEFAULT_PAIR_PATH;

  return (
    <>
    <header className="relative z-40 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 sm:h-14 sm:gap-6 sm:px-5">
      {/* logo — always goes home */}
      <button onClick={() => navigate("/")} className="flex shrink-0 items-center gap-1.5">
        <img src="/monterminal-mark.svg" alt="" className="size-5 shrink-0 object-contain sm:size-6" />
        <span className="text-[18px] font-bold tracking-tight">
          Mon<span className="monad-gradient-text">Terminal</span>
        </span>
      </button>

      <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto text-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex">
        <HeaderNavItem active={!onBridge && !onPair && !onPortfolio && !onProof} onClick={() => navigate("/")}>
          Discover
        </HeaderNavItem>
        <HeaderNavItem active={onPair} onClick={() => navigate(pairPath)}>
          Spot
        </HeaderNavItem>
        <HeaderNavItem active={onBridge} onClick={() => navigate("/swap")}>
          Swap
        </HeaderNavItem>
        <HeaderNavItem active={onPortfolio} onClick={() => navigate("/portfolio")}>
          Portfolio
        </HeaderNavItem>
        <HeaderSoonItem>Launchpad</HeaderSoonItem>
        <HeaderSoonItem>Rewards</HeaderSoonItem>
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
                className="flex max-w-[9rem] items-center gap-2 whitespace-nowrap rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] font-semibold hover:border-brand sm:max-w-[13rem] sm:px-3.5 sm:text-[13px]"
              >
                <WalletGlyph />
                {!connected ? (
                  <>
                    <span className="min-[360px]:hidden">Connect</span>
                    <span className="hidden min-[360px]:inline sm:hidden">Connect</span>
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </>
                ) : chain?.unsupported ? (
                  "Wrong network"
                ) : (
                  <span className="truncate">{account.displayName ?? shortAddr(account.address)}</span>
                )}
              </button>
            );
          }}
        </ConnectButton.Custom>
        <SettingsMenu />
      </div>
    </header>
    <MobileNav onBridge={onBridge} onPair={onPair} onPortfolio={onPortfolio} pairPath={pairPath} />
    <TerminalDock onBridge={onBridge} onPair={onPair} onPortfolio={onPortfolio} onProof={onProof} pairPath={pairPath} />
    </>
  );
}

function HeaderNavItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
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

function HeaderSoonItem({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      title="Coming soon"
      className="cursor-not-allowed rounded-md px-3 py-1.5 text-muted/55"
    >
      {children}
      <span className="ml-1 align-top text-[8px] font-bold uppercase tracking-wide text-brand/70">
        Soon
      </span>
    </button>
  );
}

function TerminalDock({
  onBridge,
  onPair,
  onPortfolio,
  onProof,
  pairPath,
}: {
  onBridge: boolean;
  onPair: boolean;
  onPortfolio: boolean;
  onProof: boolean;
  pairPath: string;
}) {
  const openAiOrders = () => {
    savePersisted("panel-tab", "AI");
    navigate(pairPath);
    window.dispatchEvent(new CustomEvent("monterminal:trade-tab", { detail: "AI" }));
  };

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 hidden h-[calc(2rem+env(safe-area-inset-bottom))] items-start border-t border-line bg-[#101117]/96 px-0.5 shadow-[0_-6px_18px_rgba(0,0,0,0.16)] backdrop-blur-xl lg:flex"
    >
      <div className="hidden h-8 shrink-0 items-center gap-1.5 border-r border-line px-2.5 text-[9px] font-semibold text-up lg:flex">
        <span className="size-1.5 rounded-full bg-up shadow-[0_0_8px_rgba(119,199,175,0.8)]" />
        Monad live
      </div>

      <div className="grid h-10 min-w-0 flex-1 grid-cols-5 sm:h-8 sm:flex sm:flex-none">
        <DockItem active={!onBridge && !onPair && !onPortfolio} label="Discover" onClick={() => navigate("/")}>
          <Compass />
        </DockItem>
        <DockItem active={onPair} label="Trade" onClick={() => navigate(pairPath)}>
          <ChartLine />
        </DockItem>
        <DockItem active={onBridge} label="Swap" onClick={() => navigate("/swap")}>
          <ArrowLeftRight />
        </DockItem>
        <DockItem active={onPortfolio} label="PnL" onClick={() => navigate("/portfolio")}>
          <BriefcaseBusiness />
        </DockItem>
        <DockItem label="AI Orders" onClick={openAiOrders} accent>
          <Bot />
        </DockItem>
      </div>

      <div className="ml-auto hidden h-8 shrink-0 items-stretch border-l border-line lg:flex">
        <DockItem label="Docs" onClick={() => window.location.assign("/docs/")}>
          <BookOpenText />
        </DockItem>
        <DockItem active={onProof} label="Proof" onClick={() => navigate("/proof")}>
          <ShieldCheck />
        </DockItem>
      </div>
      <PriceTickers />
    </nav>
  );
}

function MobileNav({
  onBridge,
  onPair,
  onPortfolio,
  pairPath,
}: {
  onBridge: boolean;
  onPair: boolean;
  onPortfolio: boolean;
  pairPath: string;
}) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-3 bottom-[calc(0.65rem+env(safe-area-inset-bottom))] z-50 mx-auto grid h-12 max-w-[28rem] grid-cols-4 gap-0.5 rounded-[1.15rem] border border-line/90 bg-bg/95 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.38)] backdrop-blur-xl lg:hidden"
    >
      <MobileNavItem active={!onBridge && !onPair && !onPortfolio} label="Discover" onClick={() => navigate("/")}>
        <Compass />
      </MobileNavItem>
      <MobileNavItem active={onPair} label="Trade" onClick={() => navigate(pairPath)}>
        <ChartLine />
      </MobileNavItem>
      <MobileNavItem active={onBridge} label="Swap" onClick={() => navigate("/swap")}>
        <ArrowLeftRight />
      </MobileNavItem>
      <MobileNavItem active={onPortfolio} label="PnL" onClick={() => navigate("/portfolio")}>
        <BriefcaseBusiness />
      </MobileNavItem>
    </nav>
  );
}

function MobileNavItem({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-0 flex-col items-center justify-center gap-px rounded-[0.8rem] text-[9px] font-semibold transition-colors ${
        active
          ? "bg-brand/[0.09] text-brand"
          : "text-muted active:bg-overlay/60 active:text-fg"
      }`}
    >
      <span className="flex size-3.5 items-center justify-center [&>svg]:size-3.5">{children}</span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

interface FooterPrice {
  usd: number;
  change: number;
}

function PriceTickers() {
  const { data } = useQuery({
    queryKey: ["footer-prices"],
    refetchInterval: 60_000,
    staleTime: 45_000,
    queryFn: async () => {
      const [monad, ethereum] = await Promise.all([
        fetchDexPrice("monad", "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"),
        fetchDexPrice("ethereum", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
      ]);
      return { monad, ethereum };
    },
  });

  return (
    <div className="hidden h-8 shrink-0 items-stretch border-l border-line min-[480px]:flex">
      <PriceTicker symbol="MON" price={data?.monad ?? null} />
      <PriceTicker symbol="ETH" price={data?.ethereum ?? null} />
    </div>
  );
}

async function fetchDexPrice(chain: string, token: string): Promise<FooterPrice | null> {
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${token}`);
  if (!response.ok) return null;
  const pairs = (await response.json()) as Array<{
    priceUsd?: string;
    priceChange?: { h24?: number };
    liquidity?: { usd?: number };
  }>;
  const pair = pairs
    .filter((candidate) => Number.isFinite(Number(candidate.priceUsd)))
    .sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
  if (!pair) return null;
  const usd = Number(pair.priceUsd);
  const change = Number(pair.priceChange?.h24);
  return { usd, change: Number.isFinite(change) ? change : 0 };
}

function PriceTicker({ symbol, price }: { symbol: string; price: FooterPrice | null }) {
  const value =
    price == null
      ? "—"
      : price.usd >= 1
        ? `$${price.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : `$${price.usd.toLocaleString(undefined, { maximumSignificantDigits: 5 })}`;

  return (
    <div className="flex min-w-[5.7rem] items-center justify-center gap-1.5 border-r border-line px-2 text-[9px] tabular-nums last:border-r-0">
      <span className="font-semibold text-fg">{symbol}</span>
      <span className="text-muted">{value}</span>
      {price && (
        <span className={price.change >= 0 ? "text-up" : "text-down"}>
          {price.change >= 0 ? "+" : ""}{price.change.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function DockItem({
  active,
  label,
  onClick,
  accent = false,
  children,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-10 min-w-0 items-center justify-center gap-1 px-1.5 text-[9px] font-semibold transition-colors duration-150 sm:h-8 sm:min-w-[4.7rem] sm:px-2 ${
        active
          ? "bg-brand/[0.08] text-brand after:absolute after:inset-x-2 after:top-0 after:h-px after:bg-brand"
          : accent
            ? "text-brand hover:bg-brand/[0.08]"
            : "text-muted hover:bg-overlay/45 hover:text-fg"
      }`}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
        {children}
      </span>
      <span className="truncate max-[380px]:text-[9px]">{label}</span>
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
          <a
            href="/docs/"
            className="mt-1.5 flex items-center justify-between border-t border-line px-1.5 pt-2 font-semibold text-brand hover:underline"
          >
            <span className="inline-flex items-center gap-1.5">
              <BookOpenText className="size-3.5" /> Documentation
            </span>
            <span>↗</span>
          </a>
          <div className="mt-1.5 border-t border-line pt-1.5 text-muted">
            Non-custodial — tokens stay in your wallet until a trigger fires.
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate("/proof");
            }}
            className="mt-1.5 flex w-full items-center justify-between rounded bg-brand/10 px-1.5 py-1.5 font-semibold text-brand hover:bg-brand/15"
          >
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Live onchain proof</span>
            <span>→</span>
          </button>
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
