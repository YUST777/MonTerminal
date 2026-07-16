import type { Address } from "viem";

/** Canonical Monad-mainnet addresses. */
export const ADDRESSES = {
  WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
  UNISWAP_V3_FACTORY: "0x204faca1764b154221e35c0d20abb3c525710498" as Address,
  SWAP_ROUTER_02: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900" as Address,
  QUOTER_V2: "0x661e93cca42afacb172121ef892830ca3b70f08d" as Address,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  /** Deployed at block 88077155 — tx 0x9d68bd21e9d7b338b790cc96d562c68f396fb0f9124601b3cf23af5ed8467b2b */
  LIMIT_ORDER_BOOK: "0x595368DffF28eC08718Ca620EC9a981772628425" as Address,
} as const;

/** Block the LimitOrderBook was deployed in — event hydration starts here. */
export const BOOK_DEPLOY_BLOCK = 88077155n;

/**
 * One order book per DEX. Uniswap v3 uses the canonical SwapRouter02; the v3
 * forks (Capricorn, PancakeSwap v3) share pool bytecode but not init-code
 * hashes, so each gets a ForkRouter + its own immutable LimitOrderBook.
 * `dexId` matches GeckoTerminal's network-scoped dex slug.
 */
export interface Market {
  dexId: string;
  label: string;
  factory: Address;
  book: Address;
  deployBlock: bigint;
}

export const MARKETS: readonly Market[] = [
  {
    dexId: "uniswap-v3-monad",
    label: "Uniswap v3",
    factory: ADDRESSES.UNISWAP_V3_FACTORY,
    book: ADDRESSES.LIMIT_ORDER_BOOK,
    deployBlock: BOOK_DEPLOY_BLOCK,
  },
  {
    dexId: "capricorn-monad",
    label: "Capricorn",
    factory: "0x6B5F564339DbAD6b780249827f2198a841FEB7F3" as Address,
    // ForkRouter 0xd950EeB0063Ddc186b314113b199C1A675930686
    book: "0x07E94F44c89b648a36c7cd5408b52D76880857f7" as Address,
    deployBlock: 88086521n,
  },
  {
    dexId: "pancakeswap-v3-monad",
    label: "PancakeSwap v3",
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as Address,
    // ForkRouter 0x46dEc159b5B126f458f16c41E900137d6cAe3F24
    book: "0x1672DB600D0c0213b3971F30438482Ea2Afaf53F" as Address,
    deployBlock: 88086528n,
  },
] as const;


/** Uniswap v3 fee tiers available on Monad. */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
export type FeeTier = (typeof FEE_TIERS)[number];
