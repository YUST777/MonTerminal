import { useEffect, useRef, useState } from "react";
import { dispose, init, LineType, type Chart } from "klinecharts";
import { tickToExecutionPrice } from "@monolimit/shared";
import { useCandles } from "../hooks/market.ts";
import type { Timeframe } from "../lib/gecko.ts";
import { useTerminal } from "../state/terminal.ts";
import { useUserOrders, KIND, STATUS } from "../hooks/orders.ts";

const TFS: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

/** Candlestick chart (GeckoTerminal data) with SL/TP trigger price-lines. */
export function KlineChart() {
  const { token, pool } = useTerminal();
  const [tf, setTf] = useState<Timeframe>("15m");
  const { data: candles } = useCandles(pool, tf);
  const { data: orders } = useUserOrders();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const overlayIds = useRef<string[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = init(containerRef.current, {
      styles: {
        grid: {
          horizontal: { color: "#1d1e26" },
          vertical: { color: "#1d1e26" },
        },
        candle: {
          bar: {
            upColor: "#77c7af",
            downColor: "#ff9c9c",
            upBorderColor: "#77c7af",
            downBorderColor: "#ff9c9c",
            upWickColor: "#77c7af",
            downWickColor: "#ff9c9c",
          },
          priceMark: { last: { upColor: "#77c7af", downColor: "#ff9c9c" } },
          tooltip: { text: { color: "#8b8e9c" } },
        },
        xAxis: { axisLine: { color: "#34363f" }, tickText: { color: "#8b8e9c" } },
        yAxis: { axisLine: { color: "#34363f" }, tickText: { color: "#8b8e9c" } },
        crosshair: {
          horizontal: { line: { color: "#8b8e9c" } },
          vertical: { line: { color: "#8b8e9c" } },
        },
      },
    });
    chartRef.current = chart;
    return () => {
      dispose(containerRef.current!);
      chartRef.current = null;
    };
  }, []);

  // Feed candles
  useEffect(() => {
    if (!chartRef.current || !candles) return;
    chartRef.current.applyNewData(
      candles.map((c) => ({
        timestamp: c.timestamp * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    );
  }, [candles]);

  // Overlay open-order trigger lines for the selected market
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !token || !pool) return;
    for (const id of overlayIds.current) chart.removeOverlay({ id });
    overlayIds.current = [];
    if (!orders) return;

    for (const o of orders) {
      if (o.status !== STATUS.Open) continue;
      const involvesToken =
        o.tokenIn.toLowerCase() === token.address.toLowerCase() ||
        o.tokenOut.toLowerCase() === token.address.toLowerCase();
      if (!involvesToken) continue;

      // Trigger price expressed as TOKEN priced in WMON (chart currency=token).
      const q = pool.quote;
      const sellingToken = o.tokenIn.toLowerCase() === token.address.toLowerCase();
      const price = sellingToken
        ? tickToExecutionPrice(o.triggerTick, token.address, q.address, token.decimals, q.decimals)
        : 1 /
          tickToExecutionPrice(o.triggerTick, q.address, token.address, q.decimals, token.decimals);

      const isSl = o.kind === KIND.StopLoss;
      const id = chart.createOverlay({
        name: "priceLine",
        lock: true,
        points: [{ value: price }],
        styles: {
          line: { color: isSl ? "#ff9c9c" : "#77c7af", style: LineType.Dashed },
          text: {
            color: "#12131a",
            backgroundColor: isSl ? "#ff9c9c" : "#77c7af",
          },
        },
      });
      if (typeof id === "string") overlayIds.current.push(id);
    }
  }, [orders, token, pool]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-line bg-raised px-2 py-1">
        {TFS.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`rounded px-2 py-0.5 text-xs ${
              tf === t ? "bg-overlay text-brand" : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted">
          data: GeckoTerminal · price lines = your live triggers
        </span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
