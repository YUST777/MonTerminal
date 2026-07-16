import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { ADDRESSES, FEE_TIERS, MARKETS, tickToExecutionPrice, type Market } from "@monolimit/shared";
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

/** "capricorn-monad" → "Capricorn" — for human-readable lookup errors. */
function prettyDex(id: string) {
  return id
    .replace(/-monad$/, "")
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Paste-an-address token lookup. MonoLimit runs a book per supported DEX
 * (Uniswap v3, Capricorn, PancakeSwap v3) — so we ask GeckoTerminal for the
 * token's deepest pool on any supported market first, then fall back to
 * scanning each market's factory for TOKEN/WMON and TOKEN/USDC pairs.
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

      // Not a contract at all → clearest possible message before any ABI call.
      const code = await client!.getCode({ address });
      if (!code || code === "0x") {
        throw new Error(
          "No contract at this address on Monad — did you paste a wallet address, or a token from another chain?",
        );
      }

      let symbol: string, name: string, decimals: number;
      try {
        [symbol, name, decimals] = await client!.multicall({
          contracts: [
            { address, abi: erc20Abi, functionName: "symbol" },
            { address, abi: erc20Abi, functionName: "name" },
            { address, abi: erc20Abi, functionName: "decimals" },
          ],
          allowFailure: false,
        });
      } catch {
        throw new Error("This contract isn't a standard ERC-20 token");
      }

      const gecko = await fetchTokenPools(address).catch(() => []);
      // Gecko sorts deepest-first, so the first supported dex wins.
      const supported = gecko.find((p) => MARKETS.some((m) => m.dexId === p.dexId));
      let poolAddress: Address | null;
      let market: Market | undefined;
      if (supported) {
        poolAddress = supported.address as Address;
        market = MARKETS.find((m) => m.dexId === supported.dexId)!;
      } else {
        const scanned = await factoryScan(address);
        poolAddress = scanned?.pool ?? null;
        market = scanned?.market;
      }
      if (!poolAddress || !market) {
        const elsewhere = gecko[0];
        throw new Error(
          elsewhere
            ? `${symbol} only trades on ${prettyDex(elsewhere.dexId)} ($${Math.round(elsewhere.reserveUsd).toLocaleString()} liq) — MonoLimit supports ${MARKETS.map((m) => m.label).join(", ")}, and ${symbol} has no pool on any of them`
            : `${symbol} has no pool on a supported DEX (${MARKETS.map((m) => m.label).join(", ")})`,
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
          market,
        },
      };
    },
  });

  /** On-chain fallback: TOKEN vs {WMON, USDC} across every market's factory + fee tier, deepest wins. */
  async function factoryScan(token: Address): Promise<{ pool: Address; market: Market } | null> {
    const combos = MARKETS.flatMap((market) =>
      QUOTE_CANDIDATES.flatMap((quote) => FEE_TIERS.map((fee) => ({ market, quote, fee }))),
    ).filter((c) => c.quote.toLowerCase() !== token.toLowerCase());
    const pools = await client!.multicall({
      contracts: combos.map((c) => ({
        address: c.market.factory,
        abi: FACTORY_ABI,
        functionName: "getPool" as const,
        args: [token, c.quote, c.fee] as const,
      })),
      allowFailure: true,
    });
    const found: { pool: Address; market: Market }[] = [];
    pools.forEach((r, i) => {
      if (r.status === "success" && r.result !== "0x0000000000000000000000000000000000000000") {
        found.push({ pool: r.result, market: combos[i]!.market });
      }
    });
    if (found.length === 0) return null;
    const liqs = await client!.multicall({
      contracts: found.map((f) => ({ address: f.pool, abi: POOL_ABI, functionName: "liquidity" as const })),
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
