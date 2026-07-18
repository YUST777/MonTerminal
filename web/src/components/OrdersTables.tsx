import { useMemo } from "react";
import { ADDRESSES, distanceToTriggerPct, tickToExecutionPrice } from "@monolimit/shared";
import { useAccount } from "wagmi";
import { useLivePrice } from "../hooks/market.ts";
import { KIND, STATUS, orderKey, useUserOrders, type UserOrder } from "../hooks/orders.ts";
import { useCancelOrders } from "../hooks/trade.ts";
import { fmtAmount, fmtPct, fmtPrice, shortHash } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

const EXPLORER = "https://monadscan.com/tx/";

function kindLabel(o: UserOrder) {
  return o.kind === KIND.StopLoss ? "Stop-loss" : "Take-profit";
}

function currentMarketSide(
  order: UserOrder,
  token: ReturnType<typeof useTerminal.getState>["token"],
  pool: ReturnType<typeof useTerminal.getState>["pool"],
): "buy" | "sell" | null {
  if (!token || !pool) return null;
  const tokenIn = order.tokenIn.toLowerCase();
  const tokenOut = order.tokenOut.toLowerCase();
  if (tokenIn === token.address.toLowerCase() && tokenOut === pool.quote.address.toLowerCase()) {
    return "sell";
  }
  if (tokenIn === pool.quote.address.toLowerCase() && tokenOut === token.address.toLowerCase()) {
    return "buy";
  }
  return null;
}

export function OrdersDock() {
  const { isConnected } = useAccount();
  const { data: orders, isLoading, error } = useUserOrders();
  const open = useMemo(() => orders?.filter((o) => o.status === STATUS.Open) ?? [], [orders]);
  const closed = useMemo(() => orders?.filter((o) => o.status !== STATUS.Open) ?? [], [orders]);

  if (!isConnected) {
    return (
      <OrdersState
        title="Orders are wallet-specific"
        detail="Connect your wallet to load active orders and execution history."
      />
    );
  }
  if (isLoading) return <OrdersState title="Loading your orders…" detail="Reading order events from Monad." />;
  if (error) {
    return (
      <OrdersState
        title="Orders could not be loaded"
        detail="The Monad event RPC did not respond. The app will retry automatically."
        tone="down"
      />
    );
  }
  if ((orders?.length ?? 0) === 0) {
    return (
      <OrdersState
        title="No orders yet"
        detail="Orders placed from the Limit or AI tabs will appear here."
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-line md:grid-rows-1 md:grid-cols-2 md:divide-x md:divide-y-0">
        <OpenOrdersTable orders={open} loading={isLoading} />
        <OrderHistoryTable orders={closed} />
      </div>
    </div>
  );
}

function OrdersState({
  title,
  detail,
  tone = "muted",
}: {
  title: string;
  detail: string;
  tone?: "muted" | "down";
}) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <div>
        <div className={`text-[11px] font-semibold ${tone === "down" ? "text-down" : "text-fg"}`}>
          {title}
        </div>
        <div className="mt-1 text-[10px] text-muted">{detail}</div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

function Td({ children, tone }: { children: React.ReactNode; tone?: "up" | "down" | "muted" }) {
  return (
    <td
      className={`whitespace-nowrap px-2 py-1 text-[11px] ${
        tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "muted" ? "text-muted" : ""
      }`}
    >
      {children}
    </td>
  );
}

export function OpenOrdersTable({ orders, loading }: { orders: UserOrder[]; loading: boolean }) {
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { cancel, isPending } = useCancelOrders();

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-line bg-raised px-2 py-1 text-[11px] font-semibold">
        Open orders <span className="text-muted">({orders.length})</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-raised">
            <tr>
              <Th>#</Th>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Trigger px</Th>
              <Th>Distance</Th>
              <Th>Expiry</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const isSl = o.kind === KIND.StopLoss;
              const side = currentMarketSide(o, token, pool);
              const isThisMarket = side !== null;
              const trigPrice =
                isThisMarket && token && pool
                  ? tickToExecutionPrice(
                      o.triggerTick,
                      token.address,
                      pool.quote.address,
                      token.decimals,
                      pool.quote.decimals,
                    )
                  : null;
              const dist =
                isThisMarket && live && token && pool
                  ? distanceToTriggerPct(live.tick, o.triggerTick, token.address, pool.quote.address)
                  : null;
              return (
                <tr key={orderKey(o)} className="border-b border-line/50 hover:bg-raised/50">
                  <Td tone="muted">{o.orderId.toString()}</Td>
                  <Td tone={side === "buy" ? "up" : isSl ? "down" : "up"}>
                    {side === "buy" ? "Buy limit" : kindLabel(o)}
                  </Td>
                  <Td>
                    {token && pool && side === "sell"
                      ? `${fmtAmount(o.amountIn, token.decimals)} ${token.symbol}`
                      : pool && side === "buy"
                        ? `${fmtAmount(o.amountIn, pool.quote.decimals)} ${pool.quote.symbol}`
                      : `${shortHash(o.tokenIn)}`}
                  </Td>
                  <Td>{trigPrice != null ? fmtPrice(trigPrice) : "—"}</Td>
                  <Td tone={dist != null && dist < 0 ? "down" : "up"}>
                    {dist != null ? fmtPct(dist) : "—"}
                  </Td>
                  <Td tone="muted">
                    {o.expiry === 0 ? "GTC" : new Date(o.expiry * 1000).toLocaleString()}
                  </Td>
                  <Td>
                    <button
                      onClick={() => cancel([o.orderId], o.book)}
                      disabled={isPending}
                      className="rounded border border-line px-1.5 py-px text-[10px] text-muted hover:border-down hover:text-down disabled:opacity-40"
                    >
                      cancel
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-5 text-center text-[11px] text-muted">
                  No open orders — place a stop-loss and go to sleep.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrderHistoryTable({ orders }: { orders: UserOrder[] }) {
  const { token, pool } = useTerminal();

  /** amountOut is denominated in tokenOut — resolve its decimals/symbol. */
  const received = (o: UserOrder) => {
    const net = (o.amountOut ?? 0n) - (o.keeperFee ?? 0n);
    const out = o.tokenOut.toLowerCase();
    if (pool && out === pool.quote.address.toLowerCase()) {
      const native = pool.quote.symbol === "WMON";
      return `${fmtAmount(net, pool.quote.decimals)} ${native ? "MON" : pool.quote.symbol}`;
    }
    if (token && out === token.address.toLowerCase()) {
      return `${fmtAmount(net, token.decimals)} ${token.symbol}`;
    }
    if (out === ADDRESSES.WMON.toLowerCase()) return `${fmtAmount(net, 18)} MON`;
    return `${fmtAmount(net, 18)} ${shortHash(o.tokenOut)}`;
  };
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-line bg-raised px-2 py-1 text-[11px] font-semibold">
        History <span className="text-muted">({orders.length})</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-raised">
            <tr>
              <Th>#</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th>Tx</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const executed = o.status === STATUS.Executed;
              const side = currentMarketSide(o, token, pool);
              return (
                <tr key={orderKey(o)} className="border-b border-line/50 hover:bg-raised/50">
                  <Td tone="muted">{o.orderId.toString()}</Td>
                  <Td tone={side === "buy" ? "up" : o.kind === KIND.StopLoss ? "down" : "up"}>
                    {side === "buy" ? "Buy limit" : kindLabel(o)}
                  </Td>
                  <Td tone={executed ? "up" : "muted"}>{executed ? "Executed" : "Cancelled"}</Td>
                  <Td>{executed && o.amountOut !== undefined ? received(o) : "—"}</Td>
                  <Td>
                    {(o.closedTx ?? o.placedTx) && (
                      <a
                        href={`${EXPLORER}${o.closedTx ?? o.placedTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:underline"
                      >
                        {shortHash(o.closedTx ?? o.placedTx!)}
                      </a>
                    )}
                  </Td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-5 text-center text-[11px] text-muted">
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
