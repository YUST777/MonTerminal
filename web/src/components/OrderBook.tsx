import { useState } from "react";
import { useDepth, useTrades } from "../hooks/market.ts";
import { fmtAmountNum, fmtPrice } from "../lib/format.ts";
import { useTerminal } from "../state/terminal.ts";
import { usePersistentState } from "../lib/persist.ts";

/**
 * Right-of-chart panel, hypeterminal-style: Order Book | Trades tabs.
 * The book is the pool's REAL on-chain depth (tick liquidity per spacing
 * range); trades are the pool's recent swaps from GeckoTerminal.
 */
export function OrderBook() {
  const [tab, setTab] = usePersistentState<"book" | "trades">("book-tab", "book", (v) => v === "book" || v === "trades");
  const { token, pool } = useTerminal();
  if (!token || !pool) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-raised/30">
      <div className="flex h-7 items-center gap-2.5 border-b border-line px-2 text-[11px]">
        <button
          onClick={() => setTab("book")}
          className={tab === "book" ? "border-b border-brand pb-px font-medium" : "text-muted hover:text-fg"}
        >
          Order Book
        </button>
        <button
          onClick={() => setTab("trades")}
          className={tab === "trades" ? "border-b border-brand pb-px font-medium" : "text-muted hover:text-fg"}
        >
          Trades
        </button>
      </div>
      {tab === "book" ? <BookLadder /> : <TradesFeed />}
    </div>
  );
}

function BookLadder() {
  const { token, pool } = useTerminal();
  const { data: book } = useDepth(pool, token);

  const maxTotal = Math.max(
    book?.asks[book.asks.length - 1]?.total ?? 0,
    book?.bids[book.bids.length - 1]?.total ?? 0,
    1e-18,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col text-[11px] tabular-nums">
      <div className="grid grid-cols-3 gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        <span>Price</span>
        <span className="text-right">Size ({token?.symbol})</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
        {/* asks — worst (highest) on top, best just above the spread */}
        {book?.asks
          .slice()
          .reverse()
          .map((l, i) => (
            <Level key={`a${i}`} price={l.price} size={l.size} total={l.total} max={maxTotal} side="ask" />
          ))}
        <div className="flex items-center justify-between border-y border-line bg-overlay/60 px-2 py-1 text-[10px]">
          <span className="font-medium uppercase tracking-wide text-muted">Spread</span>
          <span>
            {book ? `${fmtPrice(book.spreadAbs)} (${book.spreadPct.toFixed(3)}%)` : "—"}
          </span>
        </div>
        {book?.bids.map((l, i) => (
          <Level key={`b${i}`} price={l.price} size={l.size} total={l.total} max={maxTotal} side="bid" />
        ))}
        {!book && <div className="px-2 py-3 text-center text-muted">Loading depth…</div>}
      </div>
      <div className="border-t border-line px-2 py-1 text-[10px] text-muted">
        live AMM depth · {pool?.market.label} tick liquidity
      </div>
    </div>
  );
}

function Level({
  price,
  size,
  total,
  max,
  side,
}: {
  price: number;
  size: number;
  total: number;
  max: number;
  side: "ask" | "bid";
}) {
  return (
    <div className="relative grid grid-cols-3 gap-1 px-2 py-0.5">
      <div
        className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-down/10" : "bg-up/10"}`}
        style={{ width: `${Math.min(100, (total / max) * 100)}%` }}
        aria-hidden
      />
      <span className={`relative ${side === "ask" ? "text-down" : "text-up"}`}>{fmtPrice(price)}</span>
      <span className="relative text-right">{fmtAmountNum(size)}</span>
      <span className="relative text-right text-muted">{fmtAmountNum(total)}</span>
    </div>
  );
}

function TradesFeed() {
  const { token, pool } = useTerminal();
  const { data: trades } = useTrades(pool);

  return (
    <div className="flex min-h-0 flex-1 flex-col text-[11px] tabular-nums">
      <div className="grid grid-cols-3 gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        <span>Price $</span>
        <span className="text-right">Size ({token?.symbol})</span>
        <span className="text-right">Time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades?.map((t) => (
          <a
            key={t.tx + t.ts}
            href={`https://monadscan.com/tx/${t.tx}`}
            target="_blank"
            rel="noreferrer"
            className="grid grid-cols-3 gap-1 px-2 py-0.5 hover:bg-overlay/50"
          >
            <span className={t.side === "buy" ? "text-up" : "text-down"}>{fmtPrice(t.priceUsd)}</span>
            <span className="text-right">{fmtAmountNum(t.amount)}</span>
            <span className="text-right text-muted">
              {new Date(t.ts * 1000).toLocaleTimeString([], { hour12: false })}
            </span>
          </a>
        ))}
        {trades && trades.length === 0 && (
          <div className="px-2 py-3 text-center text-muted">No trades yet.</div>
        )}
        {!trades && <div className="px-2 py-3 text-center text-muted">Loading trades…</div>}
      </div>
    </div>
  );
}
