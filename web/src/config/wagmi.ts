import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { monad, RPC_URLS, ADDRESSES } from "@monolimit/shared";
import type { Address } from "viem";

/** Origin chains supported by the in-app Relay bridge. */
export const BRIDGE_ORIGINS = [mainnet, base, arbitrum, optimism, bsc, polygon] as const;

/** Every chain pickable in the bridge (Monad first — it's home). */
export const BRIDGE_CHAINS = [monad, ...BRIDGE_ORIGINS] as const;

export const wagmiConfig = getDefaultConfig({
  appName: "MonoLimit",
  // WalletConnect cloud id — public identifier, fine to ship in a client bundle.
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "monolimit-dev",
  chains: [monad, ...BRIDGE_ORIGINS],
  // viem's default public RPCs (eth.merkle.io & co.) reject browser CORS —
  // publicnode endpoints allow it, so ENS lookups + bridge quoting stay quiet.
  transports: {
    [monad.id]: fallback(RPC_URLS.map((u) => http(u))),
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [base.id]: http("https://base-rpc.publicnode.com"),
    [arbitrum.id]: http("https://arbitrum-one-rpc.publicnode.com"),
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [bsc.id]: http("https://bsc-rpc.publicnode.com"),
    [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
  },
});

/** Uniswap-v3 book (env override wins while iterating locally); fork-DEX books come from MARKETS. */
export const BOOK_ADDRESS: Address =
  (import.meta.env.VITE_BOOK_ADDRESS as Address | undefined) ?? ADDRESSES.LIMIT_ORDER_BOOK;
