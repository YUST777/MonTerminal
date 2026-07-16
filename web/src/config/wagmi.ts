import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { monad, RPC_URLS, ADDRESSES, BOOK_DEPLOY_BLOCK } from "@monolimit/shared";
import type { Address } from "viem";

/** Origin chains supported by the in-app Relay bridge. */
export const BRIDGE_ORIGINS = [mainnet, base, arbitrum, optimism, bsc, polygon] as const;

export const wagmiConfig = getDefaultConfig({
  appName: "MonoLimit",
  // WalletConnect cloud id — public identifier, fine to ship in a client bundle.
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "monolimit-dev",
  chains: [monad, ...BRIDGE_ORIGINS],
  transports: {
    [monad.id]: fallback(RPC_URLS.map((u) => http(u))),
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [bsc.id]: http(),
    [polygon.id]: http(),
  },
});

/** Deployed LimitOrderBook (env override wins while iterating locally). */
export const BOOK_ADDRESS: Address =
  (import.meta.env.VITE_BOOK_ADDRESS as Address | undefined) ?? ADDRESSES.LIMIT_ORDER_BOOK;

/** First block to scan for order events. */
export const DEPLOY_BLOCK = import.meta.env.VITE_DEPLOY_BLOCK
  ? BigInt(import.meta.env.VITE_DEPLOY_BLOCK)
  : BOOK_DEPLOY_BLOCK;
