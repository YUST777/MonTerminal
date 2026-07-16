import { create } from "zustand";
import type { Address } from "viem";
import { ADDRESSES } from "@monolimit/shared";

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
}

interface TerminalState {
  /** Token being traded (quoted against WMON). */
  token: TokenMeta | null;
  pool: PoolInfo | null;
  setMarket: (token: TokenMeta, pool: PoolInfo) => void;
}

/** WMON meta is static — every market on the terminal is TOKEN/WMON. */
export const WMON_META: TokenMeta = {
  address: ADDRESSES.WMON,
  symbol: "WMON",
  name: "Wrapped Monad",
  decimals: 18,
};

export const useTerminal = create<TerminalState>((set) => ({
  token: null,
  pool: null,
  setMarket: (token, pool) => set({ token, pool }),
}));
