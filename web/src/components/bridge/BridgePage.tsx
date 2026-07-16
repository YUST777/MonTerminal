import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monad } from "@monolimit/shared";
import { BRIDGE_ORIGINS } from "../../config/wagmi.ts";
import { executeRelaySteps, getRelayQuote, NATIVE, type RelayQuote } from "../../lib/relay.ts";
import { useToasts } from "../Toasts.tsx";
import { ChainIcon, ChainSelectModal, type Origin } from "./ChainSelect.tsx";

/**
 * /bridge — Uniswap-style bridge: native gas token on the origin chain →
 * native MON on Monad, quoted and filled through the Relay API. The wallet
 * is switched to the origin chain for the deposit tx, then Relay fills on
 * Monad in seconds.
 */
export function BridgePage() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [origin, setOrigin] = useState<Origin>(BRIDGE_ORIGINS[1]); // Base default
  const [selectOpen, setSelectOpen] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [quote, setQuote] = useState<RelayQuote | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data: originBalance } = useBalance({ address, chainId: origin.id });
  const { data: monBalance } = useBalance({ address, chainId: monad.id });
  const { data: walletClient } = useWalletClient({ chainId: origin.id });
  const push = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  const symbol = origin.nativeCurrency.symbol;
  const amount = (() => {
    try {
      return parseUnits(amountText, origin.nativeCurrency.decimals);
    } catch {
      return 0n;
    }
  })();
  const insufficient = !!originBalance && amount > originBalance.value;

  // Re-quote whenever origin/amount changes (debounced).
  useEffect(() => {
    setQuote(null);
    if (!address || amount === 0n || insufficient) return;
    const t = setTimeout(async () => {
      try {
        setStatus("Getting quote…");
        const q = await getRelayQuote({
          user: address,
          originChainId: origin.id,
          destinationChainId: monad.id,
          originCurrency: NATIVE,
          destinationCurrency: NATIVE, // native MON
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
  }, [address, origin.id, amount.toString(), insufficient]);

  const bridge = async () => {
    if (!quote || !address) return;
    try {
      setStatus(`Switching to ${origin.name}…`);
      await switchChainAsync({ chainId: origin.id });
      if (!walletClient) throw new Error("wallet client unavailable — try again");
      await executeRelaySteps(quote, walletClient, setStatus);
      push("success", "Bridged — MON has landed on Monad");
      queryClient.invalidateQueries();
      setAmountText("");
      setQuote(null);
      // hop the wallet back home
      setStatus("Switching back to Monad…");
      await switchChainAsync({ chainId: monad.id }).catch(() => {});
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
    : insufficient
      ? `Insufficient ${symbol}`
      : (status ?? (quote ? "Bridge" : amount === 0n ? "Enter an amount" : "Getting quote…"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[440px] flex-col px-4 py-12">
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
            <button
              onClick={() => setSelectOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-full bg-overlay py-1.5 pl-1.5 pr-2.5 text-sm font-semibold ring-1 ring-line transition-colors hover:ring-brand"
            >
              <ChainIcon chain={origin} size="size-6" />
              {symbol}
              <Chevron />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span className="tabular-nums">{inUsd ? `$${Number(inUsd).toFixed(2)}` : "\u00a0"}</span>
            <span className="tabular-nums">
              {balFmt(originBalance) != null && (
                <>
                  {balFmt(originBalance)} {symbol}
                  {originBalance!.value > 0n && (
                    <button
                      onClick={() =>
                        setAmountText(formatUnits(originBalance!.value, originBalance!.decimals))
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

        {/* arrow divider — overlaps both cards, uniswap style */}
        <div className="relative z-10 -my-3.5 flex justify-center">
          <span className="flex size-9 items-center justify-center rounded-xl border-4 border-bg bg-overlay text-muted">
            <ArrowDown />
          </span>
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
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-overlay py-1.5 pl-1.5 pr-3 text-sm font-semibold ring-1 ring-line">
              <ChainIcon chain={monad} size="size-6" />
              MON
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span className="tabular-nums">
              {outUsd ? `$${Number(outUsd).toFixed(2)}` : "\u00a0"}
            </span>
            <span className="tabular-nums">
              {balFmt(monBalance) != null ? `${balFmt(monBalance)} MON` : "\u00a0"}
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={bridge}
          disabled={!quote || !!status || insufficient}
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
                1 {symbol} ≈ {Number(rate).toFixed(2)} MON
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Route</span>
            <span className="text-fg">
              {origin.name} → Monad · Relay
            </span>
          </div>
          <div className="flex justify-between">
            <span>Est. time</span>
            <span className="text-fg">seconds</span>
          </div>
        </div>
      </div>

      {selectOpen && (
        <ChainSelectModal
          selected={origin}
          onSelect={(c) => {
            setOrigin(c);
            setSelectOpen(false);
          }}
          onClose={() => setSelectOpen(false)}
        />
      )}
    </div>
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
