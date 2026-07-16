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

/** Uniswap v3 fee tiers available on Monad. */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
export type FeeTier = (typeof FEE_TIERS)[number];
