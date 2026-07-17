/**
 * Wallet token-holdings indexer.
 *
 * On chains with a public Blockscout, one `/api/v2/addresses/{a}/token-balances`
 * call returns every ERC-20 a wallet holds with symbol/name/decimals/icon.
 * Monad mainnet has no public Blockscout (monadscan is Etherscan-family and
 * keeps token-balance endpoints behind a PRO key), so this always rejects and
 * `usePortfolio` falls back to `universeScan` — a balance-check over the known
 * token universe (bridge registry + Relay list + cached top pools).
 * If a public indexer appears, point BASE at it and the fast path lights up.
 */

import type { Address } from "viem";

const BASE: string | null = null; // no public Blockscout on Monad mainnet

export interface WalletToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  balance: bigint;
}

/** All ERC-20 holdings of a wallet in one call, largest raw balance first. */
export async function fetchWalletTokens(address: string): Promise<WalletToken[]> {
  if (!BASE) throw new Error("no token-balance indexer on Monad");
  const res = await fetch(`${BASE}/addresses/${address}/token-balances`);
  if (!res.ok) throw new Error(`Blockscout ${res.status}`);
  const items: any[] = (await res.json()) ?? [];
  return items.flatMap((it): WalletToken[] => {
    const t = it?.token ?? {};
    if (t.type !== "ERC-20") return []; // NFTs share the endpoint
    const decimals = Number(t.decimals);
    const addr = String(t.address_hash ?? t.address ?? "");
    if (!Number.isFinite(decimals) || !addr.startsWith("0x")) return [];
    let balance: bigint;
    try {
      balance = BigInt(it.value);
    } catch {
      return [];
    }
    if (balance <= 0n) return [];
    return [
      {
        address: addr as Address,
        symbol: String(t.symbol ?? "?"),
        name: String(t.name ?? t.symbol ?? "?"),
        decimals,
        logo: typeof t.icon_url === "string" && t.icon_url ? t.icon_url : null,
        balance,
      },
    ];
  });
}
