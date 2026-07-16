import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { ADDRESSES, FEE_TIERS, tickToExecutionPrice } from "@monolimit/shared";
import { fetchOhlcv, fetchPoolStats, fetchTokenPools, type Timeframe } from "../lib/gecko.ts";
import type { PoolInfo, TokenMeta } from "../state/terminal.ts";

const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);

/** Common quote tokens for the on-chain fallback scan. */
const QUOTE_CANDIDATES: Address[] = [
  ADDRESSES.WMON,
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", // USDC
];

export interface MarketLookup {
  token: TokenMeta;
  pool: PoolInfo;
}

/**
 * Paste-an-address token lookup. The book executes on Uniswap v3, but meme
 * coins pool against anything (USDC, WMON, CHOG…) — so we ask GeckoTerminal
 * for the token's deepest uniswap-v3 pool first, then fall back to scanning
 * the factory for TOKEN/WMON and TOKEN/USDC across fee tiers.
 */
export function useMarketLookup(rawQuery: string) {
  const client = usePublicClient();
  const query = rawQuery.trim();
  return useQuery({
    queryKey: ["market-lookup", query.toLowerCase()],
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

      const poolAddress = (await geckoV3Pool(address)) ?? (await factoryScan(address));
      if (!poolAddress) {
        throw new Error(
          `${symbol} has no Uniswap v3 pool on Monad — the book can only execute on Uniswap v3`,
        );
      }

      // Resolve the pool's pair + fee, then the quote token's meta.
      const [token0, token1, fee] = await client!.multicall({
        contracts: [
          { address: poolAddress, abi: POOL_ABI, functionName: "token0" },
          { address: poolAddress, abi: POOL_ABI, functionName: "token1" },
          { address: poolAddress, abi: POOL_ABI, functionName: "fee" },
        ],
        allowFailure: false,
      });
      const quoteAddr = (token0.toLowerCase() === address.toLowerCase() ? token1 : token0) as Address;
      const [quoteSymbol, quoteName, quoteDecimals] = await client!.multicall({
        contracts: [
          { address: quoteAddr, abi: erc20Abi, functionName: "symbol" },
          { address: quoteAddr, abi: erc20Abi, functionName: "name" },
          { address: quoteAddr, abi: erc20Abi, functionName: "decimals" },
        ],
        allowFailure: false,
      });

      return {
        token: { address, symbol, name, decimals },
        pool: {
          address: poolAddress,
          fee: Number(fee),
          tokenIsToken0: token0.toLowerCase() === address.toLowerCase(),
          quote: { address: quoteAddr, symbol: quoteSymbol, name: quoteName, decimals: quoteDecimals },
        },
      };
    },
  });

  /** Deepest uniswap-v3 pool for the token, per GeckoTerminal. */
  async function geckoV3Pool(token: Address): Promise<Address | null> {
    try {
      const pools = await fetchTokenPools(token);
      const v3 = pools.find((p) => p.dexId === "uniswap-v3-monad");
      return v3 ? (v3.address as Address) : null;
    } catch {
      return null; // gecko down → fall through to on-chain scan
    }
  }

  /** On-chain fallback: TOKEN vs {WMON, USDC} across all fee tiers, deepest wins. */
  async function factoryScan(token: Address): Promise<Address | null> {
    const combos = QUOTE_CANDIDATES.flatMap((quote) =>
      FEE_TIERS.map((fee) => ({ quote, fee })),
    ).filter((c) => c.quote.toLowerCase() !== token.toLowerCase());
    const pools = await client!.multicall({
      contracts: combos.map((c) => ({
        address: ADDRESSES.UNISWAP_V3_FACTORY,
        abi: FACTORY_ABI,
        functionName: "getPool" as const,
        args: [token, c.quote, c.fee] as const,
      })),
      allowFailure: false,
    });
    const found = pools.filter((p) => p !== "0x0000000000000000000000000000000000000000");
    if (found.length === 0) return null;
    const liqs = await client!.multicall({
      contracts: found.map((p) => ({ address: p, abi: POOL_ABI, functionName: "liquidity" as const })),
      allowFailure: false,
    });
    let best = 0;
    liqs.forEach((l, i) => {
      if ((l as bigint) > (liqs[best] as bigint)) best = i;
    });
    return found[best]!;
  }
}

/** Live pool tick + TOKEN price in the quote token from slot0 — same source the contract uses. */
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
        pool!.quote.address,
        token!.decimals,
        pool!.quote.decimals,
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
