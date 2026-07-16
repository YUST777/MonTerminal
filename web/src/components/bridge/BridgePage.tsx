import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monad } from "@monolimit/shared";
import { BRIDGE_CHAINS, BRIDGE_ORIGINS } from "../../config/wagmi.ts";
import { BRIDGE_TOKENS, isNative, type BridgeToken } from "../../config/tokens.ts";
import { executeRelaySteps, getRelayQuote, type RelayQuote } from "../../lib/relay.ts";
import { useToasts } from "../Toasts.tsx";
import { ChainIcon, TokenImg, TokenSelectModal, type BridgeChain } from "./ChainSelect.tsx";

interface Side {
  chain: BridgeChain;
  token: BridgeToken;
}

/**
 * /bridge — any token on any supported chain → any token on any other,
 * quoted and filled through the Relay API (bridge, swap, or both in one).
 * Defaults to ETH on Base → native MON on Monad.
 */
export function BridgePage() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [from, setFrom] = useState<Side>({
    chain: BRIDGE_ORIGINS[1],
    token: BRIDGE_TOKENS[BRIDGE_ORIGINS[1].id]![0]!,
  });
  const [to, setTo] = useState<Side>({
    chain: BRIDGE_CHAINS[0], // Monad
    token: BRIDGE_TOKENS[monad.id]![0]!, // native MON
  });
  const [selecting, setSelecting] = useState<"from" | "to" | null>(null);
  const [amountText, setAmountText] = useState("");
  const [quote, setQuote] = useState<RelayQuote | null>(null);
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
  const { data: walletClient } = useWalletClient({ chainId: from.chain.id });
  const push = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  const amount = (() => {
    try {
      return parseUnits(amountText, from.token.decimals);
    } catch {
      return 0n;
    }
  })();
  const insufficient = !!fromBalance && amount > fromBalance.value;
  const sameAsset =
    from.chain.id === to.chain.id &&
    from.token.address.toLowerCase() === to.token.address.toLowerCase();

  // Re-quote whenever the pair/amount changes (debounced).
  useEffect(() => {
    setQuote(null);
    if (!address || amount === 0n || insufficient || sameAsset) return;
    const t = setTimeout(async () => {
      try {
        setStatus("Getting quote…");
        const q = await getRelayQuote({
          user: address,
          originChainId: from.chain.id,
          destinationChainId: to.chain.id,
          originCurrency: from.token.address, // zero address = native
          destinationCurrency: to.token.address,
          amount: amount.toString(),
          recipient: address,
        });
        setQuote(q);
        setStatus(null);
      } catch (err) {
        setStatus(null);
        setQuote(null);
        push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
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
      setStatus(`Switching to ${from.chain.name}…`);
      await switchChainAsync({ chainId: from.chain.id });
      if (!walletClient) throw new Error("wallet client unavailable — try again");
      await executeRelaySteps(quote, walletClient, setStatus);
      push(
        "success",
        isSwap
          ? `Swapped — ${to.token.symbol} is in your wallet`
          : `Bridged — ${to.token.symbol} has landed on ${to.chain.name}`,
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
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
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

  const cta = !address
    ? "Connect wallet"
    : sameAsset
      ? "Select different tokens"
      : insufficient
        ? `Insufficient ${from.token.symbol}`
        : (status ??
          (quote
            ? isSwap
              ? "Swap"
              : "Bridge"
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
                      onClick={() =>
                        setAmountText(formatUnits(fromBalance!.value, fromBalance!.decimals))
                      }
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
          disabled={!quote || !!status || insufficient || sameAsset}
          className="monad-gradient mt-3 w-full rounded-2xl py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {cta}
        </button>

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
          <div className="flex justify-between">
            <span>Est. time</span>
            <span className="text-fg">seconds</span>
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
