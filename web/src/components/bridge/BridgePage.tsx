import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monad } from "@monolimit/shared";
import { BRIDGE_ORIGINS } from "../../config/wagmi.ts";
import { executeRelaySteps, getRelayQuote, NATIVE, type RelayQuote } from "../../lib/relay.ts";
import { useToasts } from "../Toasts.tsx";

type Origin = (typeof BRIDGE_ORIGINS)[number];

/**
 * /bridge — full-page cross-chain bridge: native gas token on the origin
 * chain → native MON on Monad, quoted and filled through the Relay API.
 * The wallet is switched to the origin chain for the deposit tx, then Relay
 * fills on Monad in seconds. Swap-terminal layout: You Pay ↓ You Receive.
 */
export function BridgePage() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [origin, setOrigin] = useState<Origin>(BRIDGE_ORIGINS[1]); // Base default
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

  // Re-quote whenever origin/amount changes (debounced).
  useEffect(() => {
    setQuote(null);
    if (!address || amount === 0n) return;
    const t = setTimeout(async () => {
      try {
        setStatus("quoting…");
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
  }, [address, origin.id, amount.toString()]);

  const bridge = async () => {
    if (!quote || !address) return;
    try {
      setStatus(`switching to ${origin.name}…`);
      await switchChainAsync({ chainId: origin.id });
      if (!walletClient) throw new Error("wallet client unavailable — try again");
      await executeRelaySteps(quote, walletClient, setStatus);
      push("success", "Bridged — MON has landed on Monad");
      queryClient.invalidateQueries();
      setAmountText("");
      setQuote(null);
      // hop the wallet back home
      setStatus("switching back to Monad…");
      await switchChainAsync({ chainId: monad.id }).catch(() => {});
    } catch (err) {
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
    } finally {
      setStatus(null);
    }
  };

  const balFmt = (b: { value: bigint; decimals: number } | undefined) =>
    b ? Number(formatUnits(b.value, b.decimals)).toFixed(4) : "—";

  const inUsd = quote?.details?.currencyIn?.amountUsd;
  const outFormatted = quote?.details?.currencyOut?.amountFormatted;
  const outUsd = quote?.details?.currencyOut?.amountUsd;
  const rate = quote?.details?.rate;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-10">
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="text-lg font-bold">Bridge to Monad</div>
          <p className="text-center text-xs text-muted">
            Native gas on any major chain → native MON, filled by Relay in seconds.
          </p>
        </div>

        {/* origin chain selector */}
        <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-raised p-1">
          {BRIDGE_ORIGINS.map((c) => (
            <button
              key={c.id}
              onClick={() => setOrigin(c)}
              className={`rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                origin.id === c.id ? "bg-overlay text-brand" : "text-muted hover:text-fg"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* You Pay */}
        <div className="rounded-lg border border-line bg-raised p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>You pay</span>
            <span>
              Balance: {balFmt(originBalance)} {symbol}
              {originBalance && originBalance.value > 0n && (
                <button
                  onClick={() =>
                    setAmountText(formatUnits(originBalance.value, originBalance.decimals))
                  }
                  className="ml-1.5 font-semibold text-brand hover:opacity-80"
                >
                  Max
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 rounded-md bg-overlay px-2.5 py-1.5 text-sm font-semibold">
              {symbol} · {origin.name}
            </span>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full bg-transparent text-right text-2xl font-semibold tabular-nums outline-none placeholder:text-muted"
            />
          </div>
          <div className="mt-1 text-right text-[11px] text-muted">
            {inUsd ? `$${Number(inUsd).toFixed(2)}` : "\u00a0"}
          </div>
        </div>

        {/* direction divider */}
        <div className="relative -my-5 z-10 flex justify-center">
          <span className="flex size-8 items-center justify-center rounded-full border border-line bg-overlay text-muted">
            ↓
          </span>
        </div>

        {/* You Receive */}
        <div className="rounded-lg border border-line bg-raised p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>You receive</span>
            <span>Balance: {balFmt(monBalance)} MON</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 rounded-md bg-overlay px-2.5 py-1.5 text-sm font-semibold">
              MON · Monad
            </span>
            <span
              className={`truncate text-right text-2xl font-semibold tabular-nums ${
                outFormatted ? "text-up" : "text-muted"
              }`}
            >
              {outFormatted ? `~${Number(outFormatted).toFixed(4)}` : "0.0"}
            </span>
          </div>
          <div className="mt-1 text-right text-[11px] text-muted">
            {outUsd ? `$${Number(outUsd).toFixed(2)}` : "\u00a0"}
          </div>
        </div>

        {/* CTA */}
        {!address ? (
          <div className="rounded-md border border-line bg-raised p-3 text-center text-xs text-muted">
            Connect your wallet to bridge.
          </div>
        ) : (
          <button
            onClick={bridge}
            disabled={!quote || !!status}
            className="monad-gradient w-full rounded-md py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {status ?? (quote ? `Bridge from ${origin.name}` : "Enter an amount")}
          </button>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            {rate ? `1 ${symbol} ≈ ${Number(rate).toFixed(2)} MON` : "\u00a0"}
          </span>
          <span>powered by Relay</span>
        </div>
      </div>
    </div>
  );
}
