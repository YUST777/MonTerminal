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
      const quote = await getRelayQuote({
        user: address,
        originChainId: monad.id,
        destinationChainId: monad.id,
        originCurrency: NATIVE,
        destinationCurrency: token.address,
        amount: amount.toString(),
      });
      setQuoteOut(quote.details?.currencyOut?.amountFormatted ?? null);
      // the swap executes on Monad — pull the wallet back if it wandered
      if (chainId !== monad.id) {
        setStatus("switching network…");
        await switchChainAsync({ chainId: monad.id });
      }
      const client = await getWalletClient(wagmiConfig, { chainId: monad.id });
      await executeRelaySteps(quote, client, setStatus);
      push("success", `Bought ${token.symbol}`);
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
          <span>Spend (MON)</span>
          <span>{monBalance ? fmtAmount(monBalance.value, 18) : "—"} MON</span>
        </div>
        <input
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          className="w-full rounded border border-line bg-bg px-2 py-1.5 text-right text-sm outline-none focus:border-brand"
        />
        <div className="mt-1 flex gap-1">
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
              className="flex-1 rounded border border-line px-1 py-0.5 text-[11px] text-muted hover:text-fg"
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      {quoteOut && (
        <div className="text-[11px] text-muted">
          est. out: <span className="text-up">{quoteOut}</span> {token.symbol}
        </div>
      )}
      <button
        onClick={buy}
        disabled={!amount || amount === 0n || !!status || !walletClient}
        className="monad-gradient w-full rounded py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {status ?? `Buy ${token.symbol}`}
      </button>
      <div className="text-center text-[10px] text-muted">routed via Relay</div>
    </div>
  );
}
