/**
 * Relay API integration (bridge in + instant market buys).
 * https://docs.relay.link — Monad is chain id 143 on api.relay.link.
 */
import type { Address, TypedDataDomain, WalletClient } from "viem";
import { getPublicClient, getWalletClient, switchChain } from "wagmi/actions";
import { BRIDGE_CHAINS, wagmiConfig } from "../config/wagmi.ts";
import {
  BRIDGE_TOKENS,
  isNative,
  nativeFromChain,
  type BridgeToken,
} from "../config/tokens.ts";

const BASE = "https://api.relay.link";

type BridgeChainId = (typeof wagmiConfig)["chains"][number]["id"];

export interface RelayQuoteRequest {
  user: Address;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string; // token address or 0x0…0 for native
  destinationCurrency: string;
  amount: string; // raw units of origin currency
  recipient?: Address;
  /** where funds land on failure — defaults server-side to recipient, then user */
  refundTo?: Address;
  tradeType?: "EXACT_INPUT" | "EXACT_OUTPUT" | "EXPECTED_OUTPUT";
  /** basis points 0–10000; omitted = Relay auto-calculates to guard front-running */
  slippageTolerance?: string;
}

// Optional Relay API key — public client id for higher rate limits; the API
// works keyless, so this is gated exactly like the WalletConnect project id.
const RELAY_API_KEY = import.meta.env.VITE_RELAY_API_KEY as string | undefined;
const relayHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(RELAY_API_KEY ? { "x-api-key": RELAY_API_KEY } : {}),
});

/** Sign payload inside a signature step — EIP-191 message or EIP-712 typed data. */
interface RelaySignData {
  signatureKind: "eip191" | "eip712";
  message?: string;
  domain?: TypedDataDomain;
  types?: Record<string, { name: string; type: string }[]>;
  primaryType?: string;
  value?: Record<string, unknown>;
}

export interface RelayStepItem {
  status: string;
  data: {
    // transaction kind — a ready-to-send tx on data.chainId
    to?: Address;
    data?: `0x${string}`;
    value?: string;
    chainId?: number;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    // signature kind — what to sign, and where to submit the result
    sign?: RelaySignData;
    post?: { endpoint: string; method?: string; body?: unknown };
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

/** One entry of the quote's fee breakdown. The fees object is DEPRECATED by
 * Relay for display — kept because fees.gas is still the only origin-gas
 * estimate in native units, which feeds the Max/preflight gas check. */
export interface RelayFee {
  currency?: { symbol?: string; decimals?: number };
  amount?: string;
  amountFormatted?: string;
  amountUsd?: string;
}

/** details.expandedPriceImpact — the non-deprecated fee/impact breakdown.
 * Official display mapping: relay → "Provider fee", swap+execution → "Swap impact". */
export interface RelayPriceImpact {
  swap?: { usd?: string };
  execution?: { usd?: string };
  relay?: { usd?: string };
  app?: { usd?: string };
  sponsored?: { usd?: string };
}

export interface RelayQuote {
  steps: RelayStep[];
  /** DEPRECATED by Relay — display uses details.expandedPriceImpact instead. */
  fees?: { gas?: RelayFee; relayer?: RelayFee };
  details?: {
    currencyIn?: { amountFormatted?: string; amountUsd?: string };
    currencyOut?: {
      amountFormatted?: string;
      amountUsd?: string;
      /** raw guaranteed minimum — fills below this refund instead (docs: refunds) */
      minimumAmount?: string;
    };
    rate?: string;
    timeEstimate?: number; // seconds
    expandedPriceImpact?: RelayPriceImpact;
    totalImpact?: { usd?: string; percent?: string };
    // NOTE: live-tested "0" for a funded wallet (Monad) — don't gate on it.
    userBalance?: string;
  };
}

/** Friendly copy for every expected quote errorCode (docs: handling-quote-errors). */
const QUOTE_ERROR_TEXT: Record<string, string> = {
  AMOUNT_TOO_LOW: "Amount too small to bridge",
  INSUFFICIENT_FUNDS: "Balance can't cover that amount",
  INSUFFICIENT_LIQUIDITY: "Not enough liquidity for this pair",
  NO_SWAP_ROUTES_FOUND: "No route for this pair",
  NO_INTERNAL_SWAP_ROUTES_FOUND: "No route for this pair",
  NO_QUOTES: "No route for this pair",
  UNSUPPORTED_ROUTE: "No route for this pair",
  UNSUPPORTED_CHAIN: "This chain isn't supported right now",
  CHAIN_DISABLED: "This chain isn't supported right now",
  ROUTE_TEMPORARILY_RESTRICTED: "Route busy right now — try again in a minute",
  SWAP_IMPACT_TOO_HIGH: "Price impact too high — try a smaller amount",
  UNSUPPORTED_CURRENCY: "This token can't be bridged",
  INVALID_INPUT_CURRENCY: "This token can't be bridged",
  INVALID_OUTPUT_CURRENCY: "This token can't be received here",
  INVALID_ADDRESS: "Recipient address looks invalid",
  USER_RECIPIENT_MISMATCH: "This route requires sending to your own address",
  INVALID_SLIPPAGE_TOLERANCE: "Slippage setting is out of range",
  SANCTIONED_CURRENCY: "This token is on a sanctions list",
  SANCTIONED_WALLET_ADDRESS: "This wallet address is blocked",
  FORBIDDEN: "This route isn't available for this wallet",
  UNAUTHORIZED: "This route isn't available for this wallet",
  SWAP_QUOTE_FAILED: "Pricing failed upstream — try again",
  PERMIT_FAILED: "Token permit failed — try again",
  DESTINATION_TX_FAILED: "Destination simulation failed — try again",
  UNKNOWN_ERROR: "Relay hit an unexpected error — try again",
};
/** Docs: transient upstream infrastructure blips — retry with backoff before surfacing. */
const TRANSIENT_ERRORS = new Set(["REQUEST_TIMED_OUT", "RPC_HTTP_ERROR"]);

export async function getRelayQuote(req: RelayQuoteRequest): Promise<RelayQuote> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/quote/v2`, {
      method: "POST",
      headers: relayHeaders(),
      body: JSON.stringify({ ...req, tradeType: req.tradeType ?? "EXACT_INPUT" }),
    });
    if (res.ok) return res.json();
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      errorCode?: string;
    };
    if (body.errorCode && TRANSIENT_ERRORS.has(body.errorCode) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(
      (body.errorCode && QUOTE_ERROR_TEXT[body.errorCode]) ??
        body.message ??
        `Relay quote failed (${res.status})`,
    );
  }
}

/**
 * Executes a quote's steps sequentially through the user's wallet, in order,
 * item by item (docs: "Understanding Step Execution"). Steps with no items
 * are skipped; items whose data hasn't been populated yet are re-polled via
 * `requote` (docs: "If step item data is missing then polling the api is
 * necessary"). Resolves to the destination tx hash when the status endpoint
 * reported one.
 */
export async function executeRelaySteps(
  quote: RelayQuote,
  walletClient: WalletClient,
  onProgress: (msg: string) => void,
  requote?: () => Promise<RelayQuote>,
): Promise<`0x${string}` | undefined> {
  let destTxHash: `0x${string}` | undefined;
  for (let s = 0; s < quote.steps.length; s++) {
    const step = quote.steps[s]!;
    // steps with no items, or an empty items array, are skipped (docs)
    for (let i = 0; i < (step.items ?? []).length; i++) {
      let item = step.items[i]!;
      if (item.status === "complete") continue;
      if (!hasData(item)) {
        item = await waitForItemData(quote, s, i, requote, onProgress);
      }
      onProgress(step.description || step.action);
      if (step.kind === "signature") {
        walletClient = await executeSignatureItem(item, walletClient);
      } else {
        walletClient = await executeTransactionItem(item, walletClient, onProgress);
      }
      // Poll Relay's status endpoint when provided (cross-chain fills and
      // same-chain swaps both carry one) — the receipt alone isn't the fill.
      if (item.check?.endpoint) {
        destTxHash = (await pollStatus(item.check.endpoint, onProgress)) ?? destTxHash;
      }
    }
  }
  return destTxHash;
}

const hasData = (item: RelayStepItem) => !!item.data && Object.keys(item.data).length > 0;

/** Re-fetch the quote until the step item's data is populated (1s cadence). */
async function waitForItemData(
  quote: RelayQuote,
  stepIndex: number,
  itemIndex: number,
  requote: (() => Promise<RelayQuote>) | undefined,
  onProgress: (msg: string) => void,
): Promise<RelayStepItem> {
  if (!requote) throw new Error("Relay step returned no execution data");
  for (let attempt = 0; attempt < 15; attempt++) {
    onProgress("waiting for Relay to prepare the transaction…");
    await new Promise((r) => setTimeout(r, 1000));
    const fresh = await requote().catch(() => null);
    const item = fresh?.steps[stepIndex]?.items?.[itemIndex];
    if (item && hasData(item)) return item;
  }
  throw new Error("Relay never returned execution data for this step");
}

/** Steps can hop chains — each item carries its own chainId, so re-point the
 * wallet when it differs from the client we're holding. */
async function clientForChain(
  walletClient: WalletClient,
  chainId: number | undefined,
): Promise<WalletClient> {
  if (!chainId || walletClient.chain?.id === chainId) return walletClient;
  await switchChain(wagmiConfig, { chainId: chainId as BridgeChainId });
  return getWalletClient(wagmiConfig, { chainId: chainId as BridgeChainId });
}

/**
 * Transaction item: send it on item.data.chainId, then wait for the receipt
 * before moving on — sequential steps (approve → deposit) depend on the prior
 * tx landing, and same-chain swaps have no other confirmation.
 */
async function executeTransactionItem(
  item: RelayStepItem,
  walletClient: WalletClient,
  onProgress: (msg: string) => void,
): Promise<WalletClient> {
  const tx = item.data;
  if (!tx.to || !tx.data) throw new Error("Relay returned a malformed transaction step");
  const client = await clientForChain(walletClient, tx.chainId);
  const hash = await client.sendTransaction({
    account: client.account!,
    chain: client.chain,
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    // Relay quotes its own gas numbers with the tx — pass them through so the
    // wallet doesn't under-estimate the deposit multicall (docs: step-execution)
    ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
    ...(tx.maxFeePerGas ? { maxFeePerGas: BigInt(tx.maxFeePerGas) } : {}),
    ...(tx.maxPriorityFeePerGas
      ? { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) }
      : {}),
  });
  onProgress(`sent ${hash.slice(0, 10)}… confirming`);
  const publicClient = tx.chainId
    ? getPublicClient(wagmiConfig, { chainId: tx.chainId as BridgeChainId })
    : undefined;
  if (publicClient) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      throw new Error(`Transaction reverted on-chain (${hash.slice(0, 10)}…)`);
    }
  }
  return client;
}

/**
 * Signature item (ERC-20 permits / relay orders): sign per data.sign, then
 * submit data.post's body with the signature riding as a query param — that's
 * the documented hand-back (docs.relay.link, "Understanding Step Execution").
 */
async function executeSignatureItem(
  item: RelayStepItem,
  walletClient: WalletClient,
): Promise<WalletClient> {
  const { sign, post } = item.data;
  const client = await clientForChain(
    walletClient,
    typeof sign?.domain?.chainId === "number" ? sign.domain.chainId : undefined,
  );
  const account = client.account!;
  let signature: `0x${string}`;
  if (sign?.signatureKind === "eip191" && sign.message != null) {
    signature = await client.signMessage({ account, message: sign.message });
  } else if (sign?.signatureKind === "eip712" && sign.types && sign.primaryType && sign.value) {
    signature = await client.signTypedData({
      account,
      domain: sign.domain,
      types: sign.types,
      primaryType: sign.primaryType,
      message: sign.value,
    });
  } else {
    throw new Error(
      `This route needs a signature step (${sign?.signatureKind ?? "unknown"}) that isn't supported yet`,
    );
  }
  if (post?.endpoint) {
    const url = new URL(
      post.endpoint.startsWith("http") ? post.endpoint : `${BASE}${post.endpoint}`,
    );
    url.searchParams.set("signature", signature);
    const res = await fetch(url, {
      method: post.method ?? "POST",
      headers: { "content-type": "application/json" },
      body: post.body != null ? JSON.stringify(post.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? `Relay signature submit failed (${res.status})`);
    }
  }
  return client;
}

interface RelayStatus {
  status?: string;
  details?: string;
  /** outgoing (destination-side) tx hashes */
  txHashes?: string[];
}

/** Documented lifecycle → progress copy (docs: get-intents-status-v3). */
const STATUS_TEXT: Record<string, string> = {
  waiting: "waiting for the deposit to confirm…",
  depositing: "deposit confirmed — processing…",
  pending: "deposit confirmed — filling on the destination…",
  submitted: "submitted on the destination chain…",
  delayed: "taking longer than usual — still processing…",
};

/**
 * Polls the check endpoint once per second (the docs' recommended cadence).
 * waiting/depositing/pending/submitted/delayed are in-flight; success/refund/
 * failure are terminal. Resolves to the destination tx hash if reported.
 */
async function pollStatus(
  endpoint: string,
  onProgress: (msg: string) => void,
): Promise<`0x${string}` | undefined> {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE}${endpoint}`;
  for (let i = 0; i < 300; i++) {
    // A network blip (or empty body) on one poll shouldn't abort the whole
    // fill — swallow it and try again on the next tick.
    let body: RelayStatus = {};
    try {
      const res = await fetch(url, { headers: relayHeaders() });
      if (res.ok) body = (await res.json()) as RelayStatus;
    } catch {
      /* retry next iteration */
    }
    const { status, details } = body;
    if (status === "success") return body.txHashes?.[0] as `0x${string}` | undefined;
    if (status === "failure" || status === "refund") {
      throw new Error(
        status === "refund"
          ? `Fill failed — funds refunded on the origin chain${details ? ` (${details})` : ""}`
          : `Relay fill failed${details ? ` (${details})` : ""}`,
      );
    }
    if (status) onProgress(`relay: ${STATUS_TEXT[status] ?? `${status}…`}`);
    await new Promise((r) => setTimeout(r, 1000));
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

async function queryCurrencies(body: Record<string, unknown>): Promise<BridgeToken[]> {
  // /currencies/v2 — flat array (v1 returned grouped arrays)
  const res = await fetch(`${BASE}/currencies/v2`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Relay currencies failed (${res.status})`);
  const list = (await res.json()) as RelayCurrency[];
  return list
    .filter((c) => c.vmType === "evm")
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      address: c.address as Address,
      decimals: c.decimals,
      logo: c.metadata?.logoURI ?? "",
    }));
}

/** The zero-address native token leads the list — Relay omits it on some
 * chains, so synthesize it rather than hide the gas token. */
function withNativeFirst(chainId: number, list: BridgeToken[]): BridgeToken[] {
  const i = list.findIndex(isNative);
  if (i === 0) return list;
  if (i > 0) return [list[i]!, ...list.slice(0, i), ...list.slice(i + 1)];
  // prefer the static registry's entry (it carries a logo), else build from the chain
  const registered = BRIDGE_TOKENS[chainId]?.find(isNative);
  if (registered) return [registered, ...list];
  const chain = BRIDGE_CHAINS.find((c) => c.id === chainId);
  return chain ? [nativeFromChain(chain), ...list] : list;
}

/**
 * Live token list for a chain from Relay's currencies API.
 * Without a term: the curated default list, falling back to the verified
 * catalog when a chain has no default list (exotic chains).
 * With a term: verified full-catalog search, so any bridgeable token is findable.
 */
export async function fetchRelayTokens(
  chainId: number,
  term?: string,
): Promise<BridgeToken[]> {
  const base = { chainIds: [chainId], limit: 30 };
  if (term) {
    const t = term.trim();
    // A pasted contract address hits the dedicated `address` filter — the
    // default list can't carry every coin, but any CA Relay can route resolves.
    // Free-text search skips the verified filter on purpose (most memecoins
    // aren't flagged verified) and lets Relay fall back to 3rd-party search
    // for tokens it hasn't indexed yet.
    const body = /^0x[0-9a-fA-F]{40}$/.test(t)
      ? { ...base, address: t.toLowerCase(), useExternalSearch: true }
      : { ...base, term: t, useExternalSearch: true };
    return queryCurrencies(body);
  }
  let list = await queryCurrencies({ ...base, defaultList: true });
  if (list.length === 0) list = await queryCurrencies({ ...base, verified: true });
  return withNativeFirst(chainId, list);
}
