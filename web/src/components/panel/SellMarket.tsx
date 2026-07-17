import { useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { monad } from "@monolimit/shared";
import { executeRelaySteps, getRelayQuote, NATIVE } from "../../lib/relay.ts";
import { useTokenBalance } from "../../hooks/trade.ts";
import { fmtAmount, formatUnitsTrimmed, parseAmount } from "../../lib/format.ts";
import { wagmiConfig } from "../../config/wagmi.ts";
import { useTerminal } from "../../state/terminal.ts";
import { useToasts } from "../Toasts.tsx";

/** Instant market sell: token → native MON via Relay (approval is a Relay step). */
export function SellMarket() {
  const { token } = useTerminal();
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { data: balance } = useTokenBalance(token?.address);
  const [amountText, setAmountText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const push = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  if (!token) return null;
  const amount = parseAmount(amountText, token.decimals);
  const overBalance = amount !== null && balance !== undefined && amount > balance;

  const sell = async () => {
    if (!amount || !address || !walletClient) return;
    setStatus("quoting…");
    try {
      const requestQuote = () =>
        getRelayQuote({
          user: address,
          originChainId: monad.id,
          destinationChainId: monad.id,
          originCurrency: token.address,
          destinationCurrency: NATIVE,
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
      push("success", `Sold ${token.symbol} for MON`);
      queryClient.invalidateQueries();
    } catch (err) {
      push("error", (err as Error).message.split("\n")[0]!.slice(0, 140));
    } finally {
      setStatus(null);
    }
  };

  return (
    <div className="space-y-2.5 p-2.5">
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>Sell ({token.symbol})</span>
          <span>{balance !== undefined ? fmtAmount(balance, token.decimals) : "—"}</span>
        </div>
        <input
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          className="w-full rounded border border-line bg-bg px-2 py-1.5 text-right text-sm outline-none focus:border-down"
        />
        <div className="mt-1 flex gap-1">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() =>
                balance !== undefined &&
                // gas is paid in MON, so the full token balance is sellable
                setAmountText(formatUnitsTrimmed((balance * BigInt(p)) / 100n, token.decimals))
              }
              className="flex-1 rounded border border-line px-1 py-0.5 text-[11px] text-muted hover:text-fg"
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      {overBalance && <div className="text-[11px] text-warn">More than your balance</div>}
      {quoteOut && (
        <div className="text-[11px] text-muted">
          est. out: <span className="text-up">{quoteOut}</span> MON
        </div>
      )}
      <button
        onClick={sell}
        disabled={!amount || amount === 0n || overBalance || !!status || !walletClient}
        className="w-full rounded bg-down/80 py-1.5 text-xs font-semibold text-white hover:bg-down disabled:opacity-40"
      >
        {status ?? `Sell ${token.symbol}`}
      </button>
      <div className="text-center text-[10px] text-muted">routed via Relay</div>
    </div>
  );
}
