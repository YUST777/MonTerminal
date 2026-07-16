/**
 * Relay API integration (bridge in + instant market buys).
 * https://docs.relay.link — Monad is chain id 143 on api.relay.link.
 */
import type { Address, WalletClient } from "viem";
import type { BridgeToken } from "../config/tokens.ts";

const BASE = "https://api.relay.link";

export interface RelayQuoteRequest {
  user: Address;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string; // token address or 0x0…0 for native
  destinationCurrency: string;
  amount: string; // raw units of origin currency
  recipient?: Address;
  tradeType?: "EXACT_INPUT" | "EXACT_OUTPUT";
}

export interface RelayStepItem {
  status: string;
  data: {
    to: Address;
    data: `0x${string}`;
    value?: string;
    chainId: number;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  check?: { endpoint: string; method: string };
}

export interface RelayStep {
  id: string;
  kind: "transaction" | "signature";
  action: string;
  description: string;
  items: RelayStepItem[];
}

export interface RelayQuote {
  steps: RelayStep[];
  details?: {
    currencyIn?: { amountFormatted?: string; amountUsd?: string };
    currencyOut?: { amountFormatted?: string; amountUsd?: string };
    rate?: string;
  };
}

export async function getRelayQuote(req: RelayQuoteRequest): Promise<RelayQuote> {
  const res = await fetch(`${BASE}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...req, tradeType: req.tradeType ?? "EXACT_INPUT" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Relay quote failed (${res.status})`);
  }
  return res.json();
}

/** Executes a quote's transaction steps sequentially through the user's wallet. */
export async function executeRelaySteps(
  quote: RelayQuote,
  walletClient: WalletClient,
  onProgress: (msg: string) => void,
): Promise<void> {
  for (const step of quote.steps) {
    if (step.kind !== "transaction") continue;
    for (const item of step.items) {
      onProgress(step.description || step.action);
      const hash = await walletClient.sendTransaction({
        account: walletClient.account!,
        chain: walletClient.chain,
        to: item.data.to,
        data: item.data.data,
        value: item.data.value ? BigInt(item.data.value) : 0n,
      });
      onProgress(`sent ${hash.slice(0, 10)}…`);
      // Poll Relay's status endpoint when provided (cross-chain fills).
      if (item.check?.endpoint) {
        await pollStatus(item.check.endpoint, onProgress);
      }
    }
  }
}

async function pollStatus(endpoint: string, onProgress: (msg: string) => void): Promise<void> {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE}${endpoint}`;
  for (let i = 0; i < 90; i++) {
    const res = await fetch(url);
    if (res.ok) {
      const { status } = await res.json();
      if (status === "success") return;
      if (status === "failure" || status === "refund") throw new Error(`Relay fill ${status}`);
      onProgress(`relay: ${status ?? "pending"}…`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Relay fill timed out");
}

export const NATIVE = "0x0000000000000000000000000000000000000000";

interface RelayCurrency {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  vmType: string;
  metadata?: { logoURI?: string; verified?: boolean };
}

/**
 * Live token list for a chain from Relay's currencies API.
 * Without a term: the curated default list (verified list on Monad, where
 * Relay has no default list yet). With a term: verified full-catalog search,
 * so any bridgeable token is findable.
 */
export async function fetchRelayTokens(
  chainId: number,
  term?: string,
): Promise<BridgeToken[]> {
  const body: Record<string, unknown> = { chainIds: [chainId], limit: 30 };
  if (term) {
    body.term = term;
    body.verified = true;
  } else if (chainId === 143) {
    body.verified = true;
  } else {
    body.defaultList = true;
  }
  const res = await fetch(`${BASE}/currencies/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Relay currencies failed (${res.status})`);
  const groups = (await res.json()) as RelayCurrency[][];
  return groups
    .flat()
    .filter((c) => c.vmType === "evm")
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      address: c.address as Address,
      decimals: c.decimals,
      logo: c.metadata?.logoURI ?? "",
    }));
}
