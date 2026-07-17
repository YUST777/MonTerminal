import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { monad } from "@monolimit/shared";
import { BRIDGE_CHAINS, BRIDGE_ORIGINS, wagmiConfig } from "../../config/wagmi.ts";
import { BRIDGE_TOKENS, isNative, nativeFromChain, type BridgeToken } from "../../config/tokens.ts";
import { loadPersisted, savePersisted } from "../../lib/persist.ts";
import { executeRelaySteps, getRelayQuote, type RelayQuote } from "../../lib/relay.ts";
import { useToasts } from "../Toasts.tsx";
import { ChainIcon, TokenImg, TokenSelectModal, type BridgeChain } from "./ChainSelect.tsx";

interface Side {
  chain: BridgeChain;
  token: BridgeToken;
}

/** First token of a chain's static registry, or its synthesized native token —
 * the 52 generated chains have no BRIDGE_TOKENS entry. */
const defaultToken = (chain: BridgeChain): BridgeToken =>
  BRIDGE_TOKENS[chain.id]?.[0] ?? nativeFromChain(chain);

/** Serialized side selection — chain by id (rehydrated from the registry so
 * transports/config stay canonical), token stored whole (plain JSON). */
interface StoredSide {
  chainId: number;
  token: BridgeToken;
}
const restoreSide = (key: string, fallback: Side): Side => {
  const stored = loadPersisted<StoredSide>(key);
  const chain = BRIDGE_CHAINS.find((c) => c.id === stored?.chainId);
  if (!chain || typeof stored?.token?.address !== "string") return fallback;
  return { chain, token: stored.token };
};

/**
 * Rough per-chain gas reserve so a native-token Max still pays for the origin
 * deposit (a Relay multicall, not a plain transfer). ERC-20 Max stays all-in —
 * gas comes from the untouched native.
 */
const GAS_RESERVE: Record<number, bigint> = {
  1: parseUnits("0.002", 18), // mainnet gas is the pricey one
  56: parseUnits("0.001", 18),
  137: parseUnits("0.2", 18), // POL is cheap per unit
  143: parseUnits("0.15", 18), // Monad — the deposit multicall ran ~0.08 MON live
};
// ETH-denominated gas is expensive per unit; alt-native chains burn more units.
const gasReserve = (chain: BridgeChain) =>
  GAS_RESERVE[chain.id] ??
  (chain.nativeCurrency.symbol === "ETH" ? parseUnits("0.001", 18) : parseUnits("0.02", 18));

/** Wallet "user hit cancel" errors come in many shapes — normalize them. */
const isUserRejection = (err: unknown): boolean => {
  const e = err as { code?: number; name?: string; message?: string; cause?: unknown };
  if (e?.code === 4001 || e?.name === "UserRejectedRequestError") return true;
  if (/user rejected|user denied|rejected the request/i.test(e?.message ?? "")) return true;
  return e?.cause ? isUserRejection(e.cause) : false;
};

const trimError = (err: unknown) =>
  ((err as Error).message ?? "Something went wrong").split("\n")[0]!.slice(0, 140);

/**
 * /bridge — any token on any supported chain → any token on any other,
 * quoted and filled through the Relay API (bridge, swap, or both in one).
 * Defaults to ETH on Base → native MON on Monad.
 */
export function BridgePage() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  // Last-used pair survives reloads; first visit defaults to Base → Monad.
  const [from, setFromState] = useState<Side>(() =>
    restoreSide("bridge-from", {
      chain: BRIDGE_ORIGINS[1], // Base — the majors are pinned ahead of the generated chains
      token: defaultToken(BRIDGE_ORIGINS[1]),
    }),
  );
  const [to, setToState] = useState<Side>(() =>
    restoreSide("bridge-to", {
      chain: BRIDGE_CHAINS[0], // Monad
      token: defaultToken(BRIDGE_CHAINS[0]), // native MON
    }),
  );
  const setFrom = (s: Side) => {
    savePersisted("bridge-from", { chainId: s.chain.id, token: s.token });
    setFromState(s);
  };
  const setTo = (s: Side) => {
    savePersisted("bridge-to", { chainId: s.chain.id, token: s.token });
    setToState(s);
  };
  const [selecting, setSelecting] = useState<"from" | "to" | null>(null);
  const [amountText, setAmountText] = useState("");
  const [quote, setQuote] = useState<RelayQuote | null>(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data: fromBalance } = useBalance({
    address,
    chainId: from.chain.id,
    token: isNative(from.token) ? undefined : from.token.address,
  });
  const { data: toBalance } = useBalance({
    address,
    chainId: to.chain.id,
    token: isNative(to.token) ? undefined : to.token.address,
  });
  // Origin-chain native balance — that's what funds gas even when the origin
  // token is an ERC-20.
  const { data: fromNative } = useBalance({ address, chainId: from.chain.id });
  const push = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  const amount = (() => {
    try {
      // parseUnits rejects "1e5", "1,5" & co.; "-1" parses, so clamp non-positive to empty
      const v = parseUnits(amountText, from.token.decimals);
      return v > 0n ? v : 0n;
    } catch {
      return 0n;
    }
  })();
  const insufficient = !!fromBalance && amount > fromBalance.value;
  // Relay's origin-gas estimate vs what's actually left in the wallet — catch
  // it here instead of letting the wallet grey out its sign button. (fees is
  // deprecated for display, but fees.gas is still the only origin-gas number;
  // details.userBalance came back "0" for a funded wallet live, so no help.)
  const gasFee = quote?.fees?.gas?.amount ? BigInt(quote.fees.gas.amount) : 0n;
  const gasShort =
    !!quote &&
    !!fromNative &&
    (isNative(from.token) ? amount + gasFee : gasFee) > fromNative.value;
  const sameAsset =
    from.chain.id === to.chain.id &&
    from.token.address.toLowerCase() === to.token.address.toLowerCase();

  // One quote request shape for the debounced fetch, the pre-execute refresh
  // and the missing-step-data re-poll — always the same parameters.
  const requestQuote = () =>
    getRelayQuote({
      user: address!,
      originChainId: from.chain.id,
      destinationChainId: to.chain.id,
      originCurrency: from.token.address, // zero address = native
      destinationCurrency: to.token.address,
      amount: amount.toString(),
      recipient: address!,
      refundTo: address!, // explicit — failures land back in the user's wallet
    });

  // Re-quote whenever the pair/amount changes (debounced).
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!address || amount === 0n || insufficient || sameAsset) return;
    const t = setTimeout(async () => {
      try {
        setStatus("Getting quote…");
        const q = await requestQuote();
        setQuote(q);
        setQuotedAt(Date.now());
        setStatus(null);
      } catch (err) {
        setStatus(null);
        setQuote(null);
        // inline, not a toast — this fires on every debounce retry while typing
        setQuoteError(trimError(err));
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    from.chain.id,
    from.token.address,
    to.chain.id,
    to.token.address,
    amount.toString(),
    insufficient,
    sameAsset,
  ]);

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmountText("");
    setQuote(null);
  };

  const isSwap = from.chain.id === to.chain.id;

  const bridge = async () => {
    if (!quote || !address) return;
    try {
      // "Quotes are revalidated when being filled, keep your quotes as fresh
      // as possible" — refresh anything older than ~30s before executing.
      let q = quote;
      if (Date.now() - quotedAt > 30_000) {
        setStatus("Refreshing quote…");
        q = await requestQuote();
        setQuote(q);
        setQuotedAt(Date.now());
      }
      setStatus(`Switching to ${from.chain.name}…`);
      try {
        // wagmi falls back to wallet_addEthereumChain for chains the wallet
        // doesn't know — all 59 carry rpcUrls + explorers, so that just works
        // unless the user declines the prompt.
        await switchChainAsync({ chainId: from.chain.id });
      } catch (err) {
        throw new Error(
          isUserRejection(err)
            ? `Chain switch declined — approve ${from.chain.name} in your wallet to continue`
            : `Couldn't switch to ${from.chain.name} — add it to your wallet and retry`,
        );
      }
      // Fetch the client AFTER the switch — a useWalletClient hook value here
      // would be a stale pre-switch snapshot (undefined for foreign chains).
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: from.chain.id,
      });
      const destTx = await executeRelaySteps(q, walletClient, setStatus, requestQuote);
      push(
        "success",
        (isSwap
          ? `Swapped — ${to.token.symbol} is in your wallet`
          : `Bridged — ${to.token.symbol} has landed on ${to.chain.name}`) +
          (destTx ? ` · ${destTx.slice(0, 10)}…` : ""),
      );
      queryClient.invalidateQueries();
      setAmountText("");
      setQuote(null);
      if (from.chain.id !== monad.id) {
        // hop the wallet back home
        setStatus("Switching back to Monad…");
        await switchChainAsync({ chainId: monad.id }).catch(() => {});
      }
    } catch (err) {
      push("error", isUserRejection(err) ? "Cancelled in wallet" : trimError(err));
    } finally {
      setStatus(null);
    }
  };

  const balFmt = (b: { value: bigint; decimals: number } | undefined) =>
    b ? Number(formatUnits(b.value, b.decimals)).toFixed(4) : null;

  const inUsd = quote?.details?.currencyIn?.amountUsd;
  const outFormatted = quote?.details?.currencyOut?.amountFormatted;
  const outUsd = quote?.details?.currencyOut?.amountUsd;
  const rate = quote?.details?.rate;
  // Official display mapping for details.expandedPriceImpact (the fees object
  // is deprecated): relay → "Provider fee", swap + execution → "Swap impact".
  // At dust amounts the flat execution fee dominates the in/out difference —
  // this is what explains it.
  const impact = quote?.details?.expandedPriceImpact;
  const swapImpactUsd = impact
    ? Number(impact.swap?.usd ?? 0) + Number(impact.execution?.usd ?? 0)
    : null;
  const providerFeeUsd = impact?.relay?.usd != null ? Number(impact.relay.usd) : null;
  const eta = quote?.details?.timeEstimate;
  // Fills below this refund instead of landing short (docs: refunds).
  const minOutRaw = quote?.details?.currencyOut?.minimumAmount;
  const minOut = (() => {
    if (!minOutRaw) return null;
    try {
      return Number(formatUnits(BigInt(minOutRaw), to.token.decimals));
    } catch {
      return null;
    }
  })();
  const impactPct = quote?.details?.totalImpact?.percent
    ? Number(quote.details.totalImpact.percent)
    : null;
  const highImpact = impactPct != null && impactPct <= -3;

  const cta = !address
    ? "Connect wallet"
    : sameAsset
      ? "Select different tokens"
      : insufficient
        ? `Insufficient ${from.token.symbol}`
        : gasShort
          ? `Not enough ${from.chain.nativeCurrency.symbol} for gas`
          : (status ??
            (quote
              ? isSwap
                ? "Swap"
                : "Bridge"
              : quoteError
                ? "No route"
                : amount === 0n
                  ? "Enter an amount"
                  : "Getting quote…"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[440px] flex-col px-3 py-6 sm:px-4 sm:py-12">
        <div className="mb-3 px-1 text-sm font-semibold">Bridge</div>

        {/* Sell card */}
        <div className="rounded-2xl border border-line bg-raised p-4 focus-within:border-brand/50">
          <div className="mb-2 text-xs text-muted">You pay</div>
          <div className="flex items-center gap-2">
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              autoFocus
              className="w-full min-w-0 bg-transparent text-[32px] font-medium tabular-nums outline-none placeholder:text-muted"
            />
            <TokenButton side={from} onClick={() => setSelecting("from")} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span className="tabular-nums">{inUsd ? `$${Number(inUsd).toFixed(2)}` : "\u00a0"}</span>
            <span className="tabular-nums">
              {balFmt(fromBalance) != null && (
                <>
                  {balFmt(fromBalance)} {from.token.symbol}
                  {fromBalance!.value > 0n && (
                    <button
                      onClick={() => {
                        // native Max leaves gas behind; ERC-20s can go all-in
                        const reserve = isNative(from.token) ? gasReserve(from.chain) : 0n;
                        const v =
                          fromBalance!.value > reserve ? fromBalance!.value - reserve : 0n;
                        setAmountText(formatUnits(v, fromBalance!.decimals));
                      }}
                      className="ml-1.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/25"
                    >
                      Max
                    </button>
                  )}
                </>
              )}
            </span>
          </div>
        </div>

        {/* flip button — overlaps both cards, uniswap style */}
        <div className="relative z-10 -my-3.5 flex justify-center">
          <button
            onClick={flip}
            aria-label="Swap direction"
            className="flex size-9 items-center justify-center rounded-xl border-4 border-bg bg-overlay text-muted transition-all duration-150 hover:text-fg active:scale-90"
          >
            <ArrowDown />
          </button>
        </div>

        {/* Buy card */}
        <div className="rounded-2xl border border-line bg-raised p-4">
          <div className="mb-2 text-xs text-muted">You receive</div>
          <div className="flex items-center gap-2">
            <span
              className={`w-full min-w-0 truncate text-[32px] font-medium tabular-nums ${
                outFormatted ? "" : "text-muted"
              }`}
            >
              {outFormatted ? Number(outFormatted).toFixed(4) : "0"}
            </span>
            <TokenButton side={to} onClick={() => setSelecting("to")} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span className="tabular-nums">
              {outUsd ? `$${Number(outUsd).toFixed(2)}` : "\u00a0"}
            </span>
            <span className="tabular-nums">
              {balFmt(toBalance) != null ? `${balFmt(toBalance)} ${to.token.symbol}` : "\u00a0"}
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={bridge}
          disabled={!quote || !!status || insufficient || sameAsset || gasShort}
          className="monad-gradient mt-3 w-full rounded-2xl py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {cta}
        </button>

        {/* quote failures land here, not in a toast — the effect retries every debounce */}
        {quoteError && (
          <div className="mt-2 px-1 text-center text-xs text-down">{quoteError}</div>
        )}
        {gasShort && !quoteError && (
          <div className="mt-2 px-1 text-center text-xs text-down">
            Amount + estimated gas exceeds your {from.chain.nativeCurrency.symbol} balance —
            lower the amount a touch
          </div>
        )}

        {/* quote details */}
        <div className="mt-3 flex flex-col gap-1.5 px-1 text-xs text-muted">
          {rate && (
            <div className="flex justify-between">
              <span>Rate</span>
              <span className="tabular-nums text-fg">
                1 {from.token.symbol} ≈ {Number(rate).toFixed(2)} {to.token.symbol}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Route</span>
            <span className="text-fg">
              {isSwap
                ? `${from.chain.name} · Relay`
                : `${from.chain.name} → ${to.chain.name} · Relay`}
            </span>
          </div>
          {/* fee breakdown — where the in/out difference actually goes */}
          <UsdRow label="Swap impact" usd={swapImpactUsd} />
          <UsdRow label="Provider fee" usd={providerFeeUsd} />
          {minOut != null && minOut > 0 && (
            <div className="flex justify-between">
              <span>Min. received</span>
              <span className="tabular-nums text-fg">
                {minOut.toFixed(4)} {to.token.symbol}
              </span>
            </div>
          )}
          {highImpact && (
            <div className="flex justify-between text-warn">
              <span>Price impact</span>
              <span className="tabular-nums">{impactPct!.toFixed(1)}% — consider a smaller amount</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Est. time</span>
            <span className="text-fg">
              {eta != null ? (eta <= 60 ? `~${eta}s` : `~${Math.round(eta / 60)} min`) : "seconds"}
            </span>
          </div>
        </div>
      </div>

      {selecting && (
        <TokenSelectModal
          chain={selecting === "from" ? from.chain : to.chain}
          token={selecting === "from" ? from.token : to.token}
          onSelect={(c, t) => {
            if (selecting === "from") setFrom({ chain: c, token: t });
            else setTo({ chain: c, token: t });
            setSelecting(null);
          }}
          onClose={() => setSelecting(null)}
        />
      )}
    </div>
  );
}

function UsdRow({ label, usd }: { label: string; usd: number | null }) {
  if (usd == null || Number.isNaN(usd) || usd === 0) return null;
  const abs = Math.abs(usd);
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-fg">
        {abs < 0.005 ? "<$0.01" : `${usd < 0 ? "-" : ""}$${abs.toFixed(2)}`}
      </span>
    </div>
  );
}

function TokenButton({ side, onClick }: { side: Side; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-full bg-overlay py-1.5 pl-1.5 pr-2.5 text-sm font-semibold ring-1 ring-line transition-colors hover:ring-brand"
    >
      <span className="relative">
        <TokenImg token={side.token} size="size-6" />
        {/* chain badge — which network this token lives on */}
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-overlay">
          <ChainIcon chain={side.chain} size="size-3" />
        </span>
      </span>
      {side.token.symbol}
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 text-muted" fill="none" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M8 2.5v11M3.5 9 8 13.5 12.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
