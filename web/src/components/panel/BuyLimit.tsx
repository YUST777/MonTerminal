import { useMemo, useState } from "react";
import { computeTrigger, tickToExecutionPrice } from "@monolimit/shared";
import { useLivePrice } from "../../hooks/market.ts";
import { buildBuyLimitParams, usePlaceOrders, useTokenBalance } from "../../hooks/trade.ts";
import { fmtAmount, fmtPrice } from "../../lib/format.ts";
import { useTerminal } from "../../state/terminal.ts";
import { ApprovalGate, PctOfBalance, PricePicker, Row } from "./shared.tsx";

/**
 * Limit buy, exchange-style: pick a price below current, pick how much of
 * the quote token to spend, done. Fills at your price or better.
 */
export function BuyLimit() {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const quoteToken = pool?.quote ?? null;
  const { data: balance } = useTokenBalance(quoteToken?.address);
  const [pct, setPct] = useState(50);
  const [price, setPrice] = useState<number | null>(null);
  const { needsApproval, approve, place, bookReady } = usePlaceOrders(quoteToken);

  const multiple = live && price ? price / live.price : null; // token price multiple
  const valid = multiple != null && multiple > 0.01 && multiple <= 0.995; // buys sit below market
  const amountIn = balance !== undefined ? (balance * BigInt(pct)) / 100n : 0n;
  const dropPct = multiple != null ? (multiple - 1) * 100 : null;

  const exactPrice = useMemo(() => {
    if (!token || !live || !pool || !valid) return null;
    const q = pool.quote;
    const { triggerTick } = computeTrigger("tp", live.tick, 1 / multiple!, q.address, token.address);
    return tickToExecutionPrice(triggerTick, token.address, q.address, token.decimals, q.decimals);
  }, [token, live, pool, multiple, valid]);

  const estOut =
    exactPrice && balance !== undefined
      ? (Number(amountIn) / 10 ** (pool?.quote.decimals ?? 18)) / exactPrice
      : null;

  if (!token || !pool) return null;

  return (
    <div className="space-y-2.5 p-2.5">
      <PricePicker
        label="Buy when price drops to"
        current={live?.price ?? null}
        quoteSymbol={pool.quote.symbol}
        value={price}
        setValue={setPrice}
        chips={[-10, -25, -50, -75]}
      />
      {price != null && live && !valid && (
        <p className="text-[11px] text-warn">A limit buy needs a price below the current one.</p>
      )}
      <PctOfBalance balance={balance} decimals={pool.quote.decimals} pct={pct} setPct={setPct} />
      <div className="rounded border border-line bg-bg p-2">
        <Row k="Spend" v={`${fmtAmount(amountIn, pool.quote.decimals)} ${pool.quote.symbol}`} />
        <Row
          k="At"
          v={exactPrice ? `${fmtPrice(exactPrice)} ${pool.quote.symbol}` : "—"}
          tone="up"
        />
        {estOut != null && <Row k="You get ≈" v={`${fmtPrice(estOut)} ${token.symbol} or more`} />}
        <Row k="Keeper fee" v="0.30%" />
      </div>
      {pool.quote.symbol === "WMON" && (
        <p className="text-[10px] text-muted">
          Deposits WMON — wrap MON first if your balance shows 0.
        </p>
      )}
      {!bookReady && (
        <p className="text-[11px] text-muted">
          Limit orders aren't live yet — the order book contract isn't deployed.
        </p>
      )}
      <ApprovalGate
        needsApproval={needsApproval(amountIn)}
        onApprove={() => approve(amountIn)}
        onPlace={async () => {
          if (!live || !valid || dropPct == null) return;
          await place([buildBuyLimitParams({ amountIn, dropPct }, token, pool, live.tick)]);
        }}
        placeLabel={!valid ? "Pick a price below current" : `Buy at ${fmtPrice(price!)}`}
        disabled={amountIn === 0n || !live || !valid || !bookReady}
      />
    </div>
  );
}
