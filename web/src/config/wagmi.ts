import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { monad, ADDRESSES } from "@monolimit/shared";
import type { Address } from "viem";

/** Origin chains supported by the in-app Relay bridge. */
export const BRIDGE_ORIGINS = [mainnet, base, arbitrum, optimism, bsc, polygon] as const;

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
  { appName: "MonoLimit", projectId: wcProjectId ?? "monolimit-dev" },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [monad, ...BRIDGE_ORIGINS],
  // viem's default public RPCs (eth.merkle.io & co.) reject browser CORS —
  // publicnode endpoints allow it, so ENS lookups + bridge quoting stay quiet.
  transports: {
    // Browser-curated Monad list: rpc2 rate-limits hard and rpc3 times out,
    // so only the two healthy endpoints ship to the client.
    [monad.id]: fallback([http("https://rpc.monad.xyz"), http("https://rpc1.monad.xyz")]),
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [base.id]: fallback([
      http("https://base-rpc.publicnode.com"),
      http("https://mainnet.base.org"),
    ]),
    [arbitrum.id]: http("https://arbitrum-one-rpc.publicnode.com"),
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [bsc.id]: http("https://bsc-rpc.publicnode.com"),
    [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
  },
});

/** Uniswap-v3 book (env override wins while iterating locally); fork-DEX books come from MARKETS. */
export const BOOK_ADDRESS: Address =
  (import.meta.env.VITE_BOOK_ADDRESS as Address | undefined) ?? ADDRESSES.LIMIT_ORDER_BOOK;
