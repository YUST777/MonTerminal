import { useMemo } from "react";
import { ADDRESSES, distanceToTriggerPct, tickToExecutionPrice } from "@monolimit/shared";
import { useLivePrice } from "../hooks/market.ts";
import { KIND, STATUS, useUserOrders, type UserOrder } from "../hooks/orders.ts";
import { useCancelOrders } from "../hooks/trade.ts";
import { fmtAmount, fmtPct, fmtPrice, shortHash } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";

const EXPLORER = "https://monadscan.com/tx/";

function kindLabel(o: UserOrder) {
  return o.kind === KIND.StopLoss ? "Stop-loss" : "Take-profit";
}

export function OrdersDock() {
  const { data: orders, isLoading } = useUserOrders();
  const open = useMemo(() => orders?.filter((o) => o.status === STATUS.Open) ?? [], [orders]);
  const closed = useMemo(() => orders?.filter((o) => o.status !== STATUS.Open) ?? [], [orders]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-line">
        <OpenOrdersTable orders={open} loading={isLoading} />
        <OrderHistoryTable orders={closed} />
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

function Td({ children, tone }: { children: React.ReactNode; tone?: "up" | "down" | "muted" }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-1.5 text-xs ${
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
      <div className="border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold">
        Open orders <span className="text-muted">({orders.length})</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-raised">
            <tr>
              <Th>#</Th>
              <Th>Type</Th>
              <Th>Sell</Th>
              <Th>Trigger px</Th>
              <Th>Distance</Th>
              <Th>Expiry</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const isSl = o.kind === KIND.StopLoss;
              const isThisMarket =
                token && o.tokenIn.toLowerCase() === token.address.toLowerCase();
              const trigPrice =
                isThisMarket && token
                  ? tickToExecutionPrice(o.triggerTick, token.address, ADDRESSES.WMON, token.decimals, 18)
                  : null;
              const dist =
                isThisMarket && live && token
                  ? distanceToTriggerPct(live.tick, o.triggerTick, token.address, ADDRESSES.WMON)
                  : null;
              return (
                <tr key={o.orderId.toString()} className="border-b border-line/50 hover:bg-raised/50">
                  <Td tone="muted">{o.orderId.toString()}</Td>
                  <Td tone={isSl ? "down" : "up"}>{kindLabel(o)}</Td>
                  <Td>
                    {token && isThisMarket
                      ? `${fmtAmount(o.amountIn, token.decimals)} ${token.symbol}`
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
                      onClick={() => cancel([o.orderId])}
                      disabled={isPending}
                      className="rounded border border-line px-2 py-0.5 text-muted hover:border-down hover:text-down disabled:opacity-40"
                    >
                      cancel
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted">
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
  const { token } = useTerminal();
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold">
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
              return (
                <tr key={o.orderId.toString()} className="border-b border-line/50 hover:bg-raised/50">
                  <Td tone="muted">{o.orderId.toString()}</Td>
                  <Td tone={o.kind === KIND.StopLoss ? "down" : "up"}>{kindLabel(o)}</Td>
                  <Td tone={executed ? "up" : "muted"}>{executed ? "Executed" : "Cancelled"}</Td>
                  <Td>
                    {executed && o.amountOut !== undefined
                      ? `${fmtAmount(o.amountOut - (o.keeperFee ?? 0n), 18)} ${
                          token && o.tokenOut.toLowerCase() !== token.address.toLowerCase()
                            ? "WMON"
                            : (token?.symbol ?? "")
                        }`
                      : "—"}
                  </Td>
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
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
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
