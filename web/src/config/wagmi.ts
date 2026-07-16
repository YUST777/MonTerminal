import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { monad, RPC_URLS, ADDRESSES } from "@monolimit/shared";
import type { Address } from "viem";

export const wagmiConfig = getDefaultConfig({
  appName: "MonoLimit",
  // WalletConnect cloud id — public identifier, fine to ship in a client bundle.
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "monolimit-dev",
  chains: [monad],
  transports: {
    [monad.id]: fallback(RPC_URLS.map((u) => http(u))),
  },
});

/** Deployed LimitOrderBook (env override wins while iterating locally). */
export const BOOK_ADDRESS: Address =
  (import.meta.env.VITE_BOOK_ADDRESS as Address | undefined) ?? ADDRESSES.LIMIT_ORDER_BOOK;

/** First block to scan for order events. */
export const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_DEPLOY_BLOCK ?? "0");
