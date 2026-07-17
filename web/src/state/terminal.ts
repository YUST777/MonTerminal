import { create } from "zustand";
import type { Address } from "viem";
import { ADDRESSES, type Market } from "@monolimit/shared";
import { savePersisted } from "../lib/persist.ts";

export interface TokenMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export interface PoolInfo {
  address: Address;
  fee: number;
  /** true when the selected token is the pool's token0 */
  tokenIsToken0: boolean;
  /** the other side of the pool (WMON, USDC, …) — prices are quoted in this */
  quote: TokenMeta;
  /** which DEX this pool lives on — orders go to this market's book */
  market: Market;
}

interface TerminalState {
  /** Token being traded (quoted against the pool's quote token). */
  token: TokenMeta | null;
  pool: PoolInfo | null;
  setMarket: (token: TokenMeta, pool: PoolInfo) => void;
}

/** WMON meta is static — used for native-MON payout detection. */
export const WMON_META: TokenMeta = {
  address: ADDRESSES.WMON,
  symbol: "WMON",
  name: "Wrapped Monad",
  decimals: 18,
};

export const useTerminal = create<TerminalState>((set) => ({
  token: null,
  pool: null,
  setMarket: (token, pool) => {
    // Remember the last market across reloads. Only the address is read back
    // (TopNav's Spot deep link) — the pool is re-resolved fresh on navigation,
    // so nothing stale ever reaches the chart or the panels.
    savePersisted("last-market", { address: token.address, symbol: token.symbol });
    set({ token, pool });
  },
}));
