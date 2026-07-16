import { defineChain } from "viem";

/** Monad mainnet chain definition (chainId 143). */
export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.monad.xyz",
        "https://rpc1.monad.xyz",
        "https://rpc2.monad.xyz",
        "https://rpc3.monad.xyz",
      ],
    },
  },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://monadscan.com" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

export const RPC_URLS = [...monad.rpcUrls.default.http];
