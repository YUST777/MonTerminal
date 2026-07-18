import { useMemo, useState } from "react";
import { computeTrigger, tickToExecutionPrice } from "@monolimit/shared";
import { useLivePrice } from "../../hooks/market.ts";
import {
  buildOrderParams,
  usePlaceOrders,
  useTokenBalance,
  useTwapAvailable,
} from "../../hooks/trade.ts";
import { fmtAmount, fmtPrice } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { ApprovalGate, PctOfBalance, PricePicker, Row, TwapWarning } from "./shared.tsx";

/**
 * Limit sell, exchange-style: pick a price, pick how much, done. Above
 * current price it's a take-profit, below it's a stop-loss — detected
 * automatically, no jargon to configure.
 */
export function SellLimit() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: balance } = useTokenBalance(token?.address);
  const [pct, setPct] = useState(100);
  const [price, setPrice] = useState<number | null>(null);
  const { needsApproval, approve, place, bookReady } = usePlaceOrders(token);
  const twapOk = useTwapAvailable(pool);

  const multiple = live && price ? price / live.price : null;
  const kind = multiple != null && multiple < 1 ? ("sl" as const) : ("tp" as const);
  const valid = multiple != null && multiple > 0.01 && multiple <= 11 && Math.abs(multiple - 1) >= 0.005;
  const amountIn = balance !== undefined ? (balance * BigInt(pct)) / 100n : 0n;
  // fail open while the observe() probe is loading — only block a confirmed miss
  const twapBlocked = kind === "sl" && twapOk.data === false;

  const exactPrice = useMemo(() => {
    if (!token || !live || !pool || !valid) return null;
    const q = pool.quote;
    const { triggerTick } = computeTrigger(kind, live.tick, multiple!, token.address, q.address);
    return tickToExecutionPrice(triggerTick, token.address, q.address, token.decimals, q.decimals);
  }, [token, live, pool, kind, multiple, valid]);

  if (!token || !pool) return null;

  return (
    <div className="space-y-2.5 p-2.5">
      <PricePicker
        label="Sell when price hits"
        current={live?.price ?? null}
        quoteSymbol={pool.quote.symbol}
        value={price}
        setValue={setPrice}
        chips={[-50, -25, 25, 100, 300]}
      />
      <PctOfBalance balance={balance} decimals={token.decimals} pct={pct} setPct={setPct} />
      <div className="rounded border border-line bg-bg p-2">
        <Row k="Sell" v={`${fmtAmount(amountIn, token.decimals)} ${token.symbol}`} />
        <Row
          k="At"
          v={exactPrice ? `${fmtPrice(exactPrice)} ${pool.quote.symbol}` : "—"}
          tone={kind === "sl" ? "down" : "up"}
        />
        <Row k="Type" v={kind === "sl" ? "stop-loss (auto)" : "take-profit (auto)"} />
        <Row k="Keeper fee" v="0.30%" />
      </div>
      {twapBlocked && <TwapWarning />}
      {!bookReady && (
        <p className="text-[11px] text-muted">
          Limit orders aren't live yet — the order book contract isn't deployed.
        </p>
      )}
      <ApprovalGate
        needsApproval={needsApproval(amountIn)}
        onApprove={() => approve(amountIn)}
        onPlace={async () => {
          if (!live || !valid) return;
          await place([
            buildOrderParams(
              {
                kind,
                amountIn,
                multiple: multiple!,
                maxSlippageBps: kind === "sl" ? 500 : undefined,
              },
              token,
              pool,
              live.tick,
            ),
          ]);
        }}
        placeLabel={
          !valid
            ? "Pick a price"
            : `Sell at ${fmtPrice(price!)} (${kind === "sl" ? "stop-loss" : "take-profit"})`
        }
        disabled={amountIn === 0n || !live || !valid || twapBlocked || !bookReady}
      />
    </div>
  );
}
