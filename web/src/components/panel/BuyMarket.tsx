import { useState } from "react";
import { useAccount, useBalance, useSwitchChain, useWalletClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { monad } from "@monolimit/shared";
import { executeRelaySteps, getRelayQuote, NATIVE } from "../../lib/relay.ts";
import { fmtAmount, parseAmount } from "../../lib/format.ts";
import { wagmiConfig } from "../../config/wagmi.ts";
import { useTerminal } from "../../state/terminal.ts";
import { useToasts } from "../Toasts.tsx";
import { useQueryClient } from "@tanstack/react-query";

/** Instant market buy: native MON → token via Relay. */
export function BuyMarket() {
  const { token } = useTerminal();
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  // pinned to Monad — the spendable balance, not whatever chain the wallet sits on
  const { data: monBalance } = useBalance({
    address,
    chainId: monad.id,
    query: { refetchInterval: 5_000 },
  });
  const [amountText, setAmountText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const push = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  if (!token) return null;
  const amount = parseAmount(amountText, 18);

  const buy = async () => {
    if (!amount || !address || !walletClient) return;
    setStatus("quoting…");
    try {
      const requestQuote = () =>
        getRelayQuote({
          user: address,
          originChainId: monad.id,
          destinationChainId: monad.id,
          originCurrency: NATIVE,
          destinationCurrency: token.address,
          amount: amount.toString(),
          refundTo: address,
        });
      const quote = await requestQuote();
      setQuoteOut(quote.details?.currencyOut?.amountFormatted ?? null);
      // the swap executes on Monad — pull the wallet back if it wandered
      if (chainId !== monad.id) {
        setStatus("switching network…");
        await switchChainAsync({ chainId: monad.id });
      }
      const client = await getWalletClient(wagmiConfig, { chainId: monad.id });
      await executeRelaySteps(quote, client, setStatus, requestQuote);
      push("success", `Bought ${token.symbol}`);
      queryClient.invalidateQueries();
    } catch (err) {
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
    } finally {
      setStatus(null);
    }
  };

  return (
    <div className="space-y-2 p-2 pt-2.5">
      <div className="rounded-xl border border-line bg-bg/75 p-2.5 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[10px]">
          <span className="font-semibold text-fg">You pay</span>
          <span className="rounded-full bg-overlay px-2 py-1 text-muted">
            Balance {monBalance ? fmtAmount(monBalance.value, 18) : "—"} MON
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            aria-label="MON amount to spend"
            className="min-w-0 flex-1 bg-transparent text-xl font-semibold tabular-nums outline-none placeholder:text-muted/45"
          />
          <span className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand/20 text-[9px] text-brand">M</span>
            MON
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[10, 25, 50, 100].map((p) => (
            <button
              key={p}
              onClick={() =>
                monBalance &&
                setAmountText(
                  // leave MON for gas on the 100% preset (Relay deposit ran
                  // ~0.08 MON live — see BridgePage GAS_RESERVE), never go negative
                  Math.max(
                    0,
                    Number((monBalance.value * BigInt(p)) / 100n) / 1e18 -
                      (p === 100 ? 0.15 : 0),
                  ).toFixed(4),
                )
              }
              className="rounded-md border border-line bg-raised/60 px-1 py-1 text-[10px] font-medium text-muted transition-colors hover:border-brand/50 hover:text-fg"
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-bg/45 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-semibold text-fg">You receive</span>
          <span className="text-muted">Estimated</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className={`min-w-0 truncate text-lg font-semibold tabular-nums ${quoteOut ? "text-up" : "text-muted/55"}`}>
            {quoteOut ?? "—"}
          </span>
          <span className="shrink-0 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold">
            {token.symbol}
          </span>
        </div>
      </div>
      <button
        onClick={buy}
        disabled={!amount || amount === 0n || !!status || !walletClient}
        className="monad-gradient h-10 w-full rounded-lg text-sm font-bold text-white shadow-[0_8px_24px_rgba(102,86,214,0.22)] transition-opacity hover:opacity-90 disabled:shadow-none disabled:opacity-40"
      >
        {status ?? `Buy ${token.symbol}`}
      </button>
    </div>
  );
}
