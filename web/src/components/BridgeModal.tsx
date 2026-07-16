import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain, useWalletClient } from "wagmi";
import { monad } from "@monolimit/shared";
import { BRIDGE_ORIGINS } from "../config/wagmi.ts";
import { executeRelaySteps, getRelayQuote, NATIVE, type RelayQuote } from "../lib/relay.ts";
import { useToasts } from "./Toasts.tsx";
import { useQueryClient } from "@tanstack/react-query";

type Origin = (typeof BRIDGE_ORIGINS)[number];

/**
 * In-app cross-chain bridge: native gas token on the origin chain → native MON
 * on Monad, quoted and filled through the Relay API. The wallet is switched to
 * the origin chain for the deposit tx, then Relay fills on Monad in seconds.
 */
export function BridgeModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [origin, setOrigin] = useState<Origin>(BRIDGE_ORIGINS[1]); // Base default
  const [amountText, setAmountText] = useState("");
  const [quote, setQuote] = useState<RelayQuote | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data: originBalance } = useBalance({ address, chainId: origin.id });
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
      // hop the wallet back home
      setStatus("switching back to Monad…");
      await switchChainAsync({ chainId: monad.id }).catch(() => {});
      onClose();
    } catch (err) {
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
    } finally {
      setStatus(null);
    }
  };

  const outFormatted = quote?.details?.currencyOut?.amountFormatted;
  const outUsd = quote?.details?.currencyOut?.amountUsd;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] rounded-lg border border-line bg-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-semibold">Bridge to Monad</div>
        <p className="mb-4 text-xs text-muted">
          Native {symbol} on {origin.name} → native MON, filled by Relay in seconds.
        </p>

        <div className="mb-3 grid grid-cols-3 gap-1">
          {BRIDGE_ORIGINS.map((c) => (
            <button
              key={c.id}
              onClick={() => setOrigin(c)}
              className={`rounded border px-2 py-1.5 text-xs ${
                origin.id === c.id
                  ? "border-brand text-brand"
                  : "border-line text-muted hover:text-fg"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Send ({symbol})</span>
          <span>
            {originBalance
              ? Number(formatUnits(originBalance.value, originBalance.decimals)).toFixed(4)
              : "—"}{" "}
            {symbol}
          </span>
        </div>
        <input
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          className="mb-3 w-full rounded border border-line bg-bg px-3 py-2 text-right text-lg outline-none focus:border-brand"
        />

        {quote && outFormatted && (
          <div className="mb-3 rounded border border-line bg-bg p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">You receive</span>
              <span className="text-up">
                ~{Number(outFormatted).toFixed(4)} MON{outUsd ? ` ($${Number(outUsd).toFixed(2)})` : ""}
              </span>
            </div>
          </div>
        )}

        {!address ? (
          <div className="rounded border border-line bg-bg p-3 text-center text-xs text-muted">
            Connect your wallet first.
          </div>
        ) : (
          <button
            onClick={bridge}
            disabled={!quote || !!status}
            className="w-full rounded bg-brand py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {status ?? (quote ? `Bridge from ${origin.name}` : "Enter an amount")}
          </button>
        )}

        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span>powered by Relay</span>
          <button onClick={onClose} className="hover:text-fg">
            close
          </button>
        </div>
      </div>
    </div>
  );
}
