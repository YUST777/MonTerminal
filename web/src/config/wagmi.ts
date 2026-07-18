import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { monad, ADDRESSES } from "@monolimit/shared";
import type { Address, Transport } from "viem";
import { zeroAddress } from "viem";
import { EXTRA_ORIGINS } from "./bridgeChains.ts";

/**
 * Origin chains supported by the in-app Relay bridge — the six majors pinned
 * first (BridgePage defaults to index 1 = Base), then every other EVM chain
 * Relay bridges from, alphabetically (see bridgeChains.ts).
 */
export const BRIDGE_ORIGINS = [
  mainnet,
  base,
  arbitrum,
  optimism,
  bsc,
  polygon,
  ...EXTRA_ORIGINS,
] as const;

/** Every chain pickable in the bridge (Monad first — it's home). */
export const BRIDGE_CHAINS = [monad, ...BRIDGE_ORIGINS] as const;

// WalletConnect cloud id — public identifier, fine to ship in a client bundle.
// Without a real id the WC relay just 400/403s on every page load (observed
// live: 13 failed pulse.walletconnect.org + api.web3modal.org calls per visit),
// so the WalletConnect option is only offered when an id is configured.
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      // MetaMask's QR fallback also rides the WC relay, so it's gated too;
      // injectedWallet covers every browser-extension wallet regardless.
      wallets: [
        injectedWallet,
        ...(wcProjectId ? [metaMaskWallet, walletConnectWallet] : []),
      ],
    },
  ],
  { appName: "MonTerminal", projectId: wcProjectId ?? "monterminal-dev" },
);

// Bare http() rides each chain's own default RPC — for the generated chains
// that's the endpoint Relay itself uses. The majors get explicit overrides:
// viem's defaults there (eth.merkle.io & co.) reject browser CORS, while
// publicnode endpoints allow it, so ENS lookups + bridge quoting stay quiet.
const transports = Object.fromEntries(
  BRIDGE_CHAINS.map((c) => [c.id, http()]),
) as Record<(typeof BRIDGE_CHAINS)[number]["id"], Transport>;
// Keep Monad RPC traffic same-origin. The server gateway owns upstream
// fallback, so a provider rate limit never turns into browser CORS noise.
transports[monad.id] = http("/api/rpc");
transports[mainnet.id] = http("https://ethereum-rpc.publicnode.com");
transports[base.id] = fallback([
  http("https://base-rpc.publicnode.com"),
  http("https://mainnet.base.org"),
]);
transports[arbitrum.id] = http("https://arbitrum-one-rpc.publicnode.com");
transports[optimism.id] = http("https://optimism-rpc.publicnode.com");
transports[bsc.id] = http("https://bsc-rpc.publicnode.com");
transports[polygon.id] = http("https://polygon-bor-rpc.publicnode.com");

export const wagmiConfig = createConfig({
  connectors,
  chains: BRIDGE_CHAINS,
  transports,
});

/** Uniswap-v3 book (env override wins while iterating locally); fork-DEX books come from MARKETS. */
export const BOOK_ADDRESS: Address =
  (import.meta.env.VITE_BOOK_ADDRESS as Address | undefined) ?? ADDRESSES.LIMIT_ORDER_BOOK;

/**
 * A market's usable order-book address, or null when none is deployed.
 * The registry ships 0x0 until `forge script script/Deploy.s.sol` runs, so a
 * zero book falls through to the env override rather than shadowing it —
 * and callers get null instead of approving/placing against the zero address.
 */
export function resolveBook(book: Address | undefined): Address | null {
  if (book && book !== zeroAddress) return book;
  return BOOK_ADDRESS !== zeroAddress ? BOOK_ADDRESS : null;
}
