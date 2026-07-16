import type { Address, PublicClient } from "viem";
import { parseAbi } from "viem";

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

/**
 * One multicall of slot0 per poll for every watched pool → Map<pool, spot tick>.
 * Pools that fail to read are simply absent from the result for that round.
 */
export async function fetchPoolTicks(
  client: PublicClient,
  pools: Address[],
): Promise<Map<Address, number>> {
  const ticks = new Map<Address, number>();
  if (pools.length === 0) return ticks;

  const results = await client.multicall({
    contracts: pools.map((address) => ({ address, abi: POOL_ABI, functionName: "slot0" as const })),
    allowFailure: true,
  });

  results.forEach((res, i) => {
    if (res.status === "success") {
      ticks.set(pools[i]!, Number((res.result as readonly unknown[])[1]));
    }
  });
  return ticks;
}
