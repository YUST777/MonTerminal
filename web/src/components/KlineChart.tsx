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
    const el = containerRef.current;
    if (!el) return;
    // Guard against stale instances surviving HMR/StrictMode remounts —
    // klinecharts appends to the container, so wipe anything already there.
    dispose(el);
    el.innerHTML = "";
    const chart = init(el, {
      styles: {
        grid: {
          horizontal: { color: "#1a1727" },
          vertical: { color: "#1a1727" },
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
          tooltip: { text: { color: "#8f8aa8" } },
        },
        xAxis: { axisLine: { color: "#322c4a" }, tickText: { color: "#8f8aa8" } },
        yAxis: { axisLine: { color: "#322c4a" }, tickText: { color: "#8f8aa8" } },
        crosshair: {
          horizontal: { line: { color: "#8f8aa8" } },
          vertical: { line: { color: "#8f8aa8" } },
        },
      },
    });
    // Gecko timestamps are UTC epoch — render the axis in the user's zone.
    chart?.setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    chart?.setBarSpace(10); // roomy candles like the reference
    chartRef.current = chart;
    return () => {
      dispose(el);
      chartRef.current = null;
    };
  }, []);

  // Feed candles. Full reload only when the series changes (pool/timeframe);
  // 15s refetches just patch the trailing bars so zoom/scroll are preserved.
  const seriesKey = useRef("");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles) return;
    const mapped = candles.map((c) => ({
      timestamp: c.timestamp * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    const key = `${pool?.address}:${tf}`;
    if (seriesKey.current !== key) {
      seriesKey.current = key;
      chart.applyNewData(mapped);
      return;
    }
    const list = chart.getDataList();
    const lastTs = list.length > 0 ? list[list.length - 1]!.timestamp : 0;
    for (const c of mapped) if (c.timestamp >= lastTs) chart.updateData(c);
  }, [candles, pool, tf]);

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
      <div className="flex h-7 items-center gap-0.5 border-b border-line bg-bg px-1.5">
        {TFS.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              tf === t ? "bg-overlay font-semibold text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="mx-1.5 h-3.5 w-px bg-line" aria-hidden />
        <span className="text-[11px] font-medium">Candles</span>
        <div className="ml-auto flex items-center gap-2.5 text-[11px]">
          <span className="border-b border-brand px-1 pb-px font-medium">Chart</span>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
