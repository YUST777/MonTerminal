import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { ADDRESSES, FEE_TIERS, isToken0, tickToExecutionPrice } from "@monolimit/shared";
import { fetchOhlcv, fetchPoolStats, type Timeframe } from "../lib/gecko.ts";
import { WMON_META, type PoolInfo, type TokenMeta } from "../state/terminal.ts";

const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
]);

export interface MarketLookup {
  token: TokenMeta;
  pool: PoolInfo;
}

/** Paste-an-address token lookup: ERC-20 meta + deepest TOKEN/WMON v3 pool. */
export function useMarketLookup(query: string) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["market-lookup", query],
    enabled: !!client && isAddress(query),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<MarketLookup> => {
      const address = query as Address;
      const [symbol, name, decimals] = await client!.multicall({
        contracts: [
          { address, abi: erc20Abi, functionName: "symbol" },
          { address, abi: erc20Abi, functionName: "name" },
          { address, abi: erc20Abi, functionName: "decimals" },
        ],
        allowFailure: false,
      });

      // Find candidate pools across fee tiers, pick the one with most liquidity.
      const pools = await client!.multicall({
        contracts: FEE_TIERS.map((fee) => ({
          address: ADDRESSES.UNISWAP_V3_FACTORY,
          abi: FACTORY_ABI,
          functionName: "getPool" as const,
          args: [address, ADDRESSES.WMON, fee] as const,
        })),
        allowFailure: false,
      });
      const candidates = FEE_TIERS.map((fee, i) => ({ fee, pool: pools[i]! })).filter(
        (c) => c.pool !== "0x0000000000000000000000000000000000000000",
      );
      if (candidates.length === 0) throw new Error("No TOKEN/WMON Uniswap v3 pool found");

      const liqs = await client!.multicall({
        contracts: candidates.map((c) => ({
          address: c.pool,
          abi: POOL_ABI,
          functionName: "liquidity" as const,
        })),
        allowFailure: false,
      });
      let best = 0;
      liqs.forEach((l, i) => {
        if ((l as bigint) > (liqs[best] as bigint)) best = i;
      });

      return {
        token: { address, symbol, name, decimals },
        pool: {
          address: candidates[best]!.pool,
          fee: candidates[best]!.fee,
          tokenIsToken0: isToken0(address, ADDRESSES.WMON),
        },
      };
    },
  });
}

/** Live pool tick + TOKEN price in WMON from slot0 — same source the contract uses. */
export function useLivePrice(pool: PoolInfo | null, token: TokenMeta | null) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["live-price", pool?.address],
    enabled: !!client && !!pool && !!token,
    refetchInterval: 3_000,
    queryFn: async () => {
      const [, tick] = await client!.readContract({
        address: pool!.address,
        abi: POOL_ABI,
        functionName: "slot0",
      });
      const price = tickToExecutionPrice(
        Number(tick),
        token!.address,
        WMON_META.address,
        token!.decimals,
        WMON_META.decimals,
      );
      return { tick: Number(tick), price };
    },
  });
}

/** GeckoTerminal candles, refetched every 15s. */
export function useCandles(pool: PoolInfo | null, tf: Timeframe) {
  return useQuery({
    queryKey: ["candles", pool?.address, tf],
    enabled: !!pool,
    refetchInterval: 15_000,
    queryFn: () => fetchOhlcv(pool!.address, tf),
  });
}

export function usePoolStats(pool: PoolInfo | null) {
  return useQuery({
    queryKey: ["pool-stats", pool?.address],
    enabled: !!pool,
    refetchInterval: 15_000,
    queryFn: () => fetchPoolStats(pool!.address),
  });
}
