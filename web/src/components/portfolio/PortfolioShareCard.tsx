import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Download, Share2, X } from "lucide-react";
import type { Address } from "viem";
import {
  useHoldingsHistory,
  type HistoryRange,
  type Portfolio,
} from "../../hooks/portfolio.ts";
import { fmtPct, fmtUsd, shortAddr } from "../../lib/format.ts";
import { useToasts } from "../Toasts.tsx";

const WIDTH = 1600;
const HEIGHT = 900;
const RANGES: HistoryRange[] = ["1D", "1W", "1M"];
const THEMES = [
  { id: "cosmos", label: "Cosmos", swatch: "from-[#111d43] via-[#090b15] to-[#050609]" },
  { id: "aurora", label: "Aurora", swatch: "from-[#133b35] via-[#0c1115] to-[#11102a]" },
  { id: "violet", label: "Violet", swatch: "from-[#251c45] via-[#0d0b18] to-[#07080d]" },
  { id: "graph", label: "Graph", swatch: "from-[#191b22] via-[#0c0d12] to-[#07080d]" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

interface Props {
  portfolio: Portfolio | undefined;
  address: Address;
  openOrders: number | undefined;
  executed: number | undefined;
}

interface CardData {
  address: Address;
  totalUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  range: HistoryRange;
  assets: number;
  openOrders: number;
  executed: number;
  topAsset: string;
}

export function PortfolioShareCard({ portfolio, address, openOrders, executed }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1D");
  const [theme, setTheme] = useState<ThemeId>("cosmos");
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useHoldingsHistory(portfolio, range);
  const push = useToasts((state) => state.push);

  const data = useMemo<CardData>(() => {
    const points = history.data ?? [];
    const first = points[0]?.value;
    const last = points.at(-1)?.value;
    const historyPnl = first != null && last != null ? last - first : null;
    const historyPct = first != null && first > 0 && historyPnl != null ? (historyPnl / first) * 100 : null;
    const fallbackPnl = range === "1D" ? (portfolio?.change24hUsd ?? null) : null;
    const fallbackPct = range === "1D" ? (portfolio?.change24hPct ?? null) : null;

    return {
      address,
      totalUsd: portfolio?.totalUsd ?? 0,
      pnlUsd: historyPnl ?? fallbackPnl,
      pnlPct: historyPct ?? fallbackPct,
      range,
      assets: portfolio?.assets.length ?? 0,
      openOrders: openOrders ?? 0,
      executed: executed ?? 0,
      topAsset: portfolio?.assets[0]?.symbol ?? "—",
    };
  }, [address, executed, history.data, openOrders, portfolio, range]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      await document.fonts?.ready;
      if (!cancelled && canvasRef.current) await drawPortfolioCard(canvasRef.current, data, theme);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, open, theme]);

  const getBlob = async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Portfolio card is not ready yet");
    await drawPortfolioCard(canvas, data, theme);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not create the portfolio image");
    return blob;
  };

  const copy = async () => {
    setBusy("copy");
    try {
      const blob = await getBlob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image copy is not supported in this browser — use Download PNG");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      push("error", (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `monterminal-portfolio-${range.toLowerCase()}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      push("error", (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          disabled={!portfolio}
          className="flex items-center gap-1.5 rounded-md border border-line bg-overlay/55 px-2.5 py-1.5 text-[11px] font-semibold text-fg transition-colors hover:border-brand/60 hover:bg-overlay disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Share2 className="size-3.5" />
          Share Card
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[94dvh] w-[min(960px,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
            <div>
              <Dialog.Title className="text-sm font-semibold sm:text-base">
                Share Portfolio Summary
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[10px] text-muted sm:text-[11px]">
                Live wallet balances and market history rendered locally in your browser.
              </Dialog.Description>
            </div>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-overlay hover:text-fg">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
            <div className="overflow-hidden rounded-lg border border-line bg-bg shadow-inner">
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                aria-label="Portfolio share-card preview"
                className="block aspect-video h-auto w-full"
              />
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Background
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {THEMES.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        aria-label={`${option.label} background`}
                        className={`h-10 w-16 rounded-md border bg-gradient-to-br ${option.swatch} transition-all ${
                          theme === option.id
                            ? "border-brand ring-2 ring-brand/25"
                            : "border-line hover:border-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Performance range
                  </div>
                  <div className="flex gap-1 rounded-lg bg-bg p-0.5">
                    {RANGES.map((option) => (
                      <button
                        key={option}
                        onClick={() => setRange(option)}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                          range === option ? "bg-brand text-bg" : "text-muted hover:text-fg"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 sm:justify-end">
                <button
                  onClick={copy}
                  disabled={busy != null}
                  className="flex min-w-28 flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50 sm:flex-none"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : busy === "copy" ? "Copying…" : "Copy Image"}
                </button>
                <button
                  onClick={download}
                  disabled={busy != null}
                  className="flex min-w-32 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-overlay px-4 py-2 text-xs font-semibold hover:border-brand/50 hover:bg-overlay/80 disabled:opacity-50 sm:flex-none"
                >
                  <Download className="size-4" />
                  {busy === "download" ? "Rendering…" : "Download PNG"}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function drawPortfolioCard(canvas: HTMLCanvasElement, data: CardData, theme: ThemeId) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  drawBackground(ctx, theme);

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  roundRect(ctx, 42, 42, WIDTH - 84, HEIGHT - 84, 32);
  ctx.fill();
  ctx.stroke();

  const logo = await loadLogo();
  ctx.drawImage(logo, 80, 72, 78, 59);
  ctx.fillStyle = "#f3f4f8";
  ctx.font = "700 42px Inter, sans-serif";
  ctx.fillText("MonTerminal", 172, 116);
  ctx.fillStyle = "rgba(230,231,238,0.50)";
  ctx.font = "500 27px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("monterminal.fun", WIDTH - 82, 112);
  ctx.textAlign = "left";

  const up = (data.pnlUsd ?? 0) >= 0;
  const tone = data.pnlUsd == null ? "#d9dbe4" : up ? "#77c7af" : "#ff9c9c";
  ctx.fillStyle = tone;
  ctx.font = "750 106px Inter, sans-serif";
  ctx.fillText(data.pnlUsd == null ? "—" : signedUsd(data.pnlUsd), 82, 364);
  const amountWidth = ctx.measureText(data.pnlUsd == null ? "—" : signedUsd(data.pnlUsd)).width;
  ctx.fillStyle = "rgba(230,231,238,0.55)";
  ctx.font = "500 31px Inter, sans-serif";
  const labelX = 94 + amountWidth;
  ctx.fillText("holdings P&L", labelX, 346);
  const labelWidth = ctx.measureText("holdings P&L").width;
  pill(ctx, labelX + labelWidth + 24, 350, data.range);

  const cards = [
    { label: "Portfolio Value", value: fmtUsd(data.totalUsd), color: "#f3f4f8" },
    {
      label: `${data.range} Performance`,
      value: data.pnlPct == null ? "—" : fmtPct(data.pnlPct),
      color: tone,
    },
    { label: "Assets / Top Holding", value: `${data.assets}  /  ${data.topAsset}`, color: "#f3f4f8" },
    { label: "Orders Open / Executed", value: `${data.openOrders}  /  ${data.executed}`, color: "#f3f4f8" },
  ];
  const left = 82;
  const gap = 22;
  const cardWidth = (WIDTH - left * 2 - gap * 3) / 4;
  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + gap);
    const glow = index === 1;
    ctx.fillStyle = glow ? "rgba(124,111,240,0.11)" : "rgba(8,10,15,0.72)";
    ctx.strokeStyle = glow ? "rgba(160,145,240,0.35)" : "rgba(255,255,255,0.12)";
    roundRect(ctx, x, 470, cardWidth, 190, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(230,231,238,0.48)";
    ctx.font = "500 25px Inter, sans-serif";
    ctx.fillText(card.label, x + 30, 525);
    ctx.fillStyle = card.color;
    ctx.font = "700 43px Inter, sans-serif";
    fitText(ctx, card.value, x + 30, 604, cardWidth - 60, 43);
  });

  ctx.fillStyle = "rgba(230,231,238,0.13)";
  ctx.beginPath();
  ctx.arc(105, 762, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e6e7ee";
  ctx.textAlign = "center";
  ctx.font = "700 20px Inter, sans-serif";
  ctx.fillText(shortAddr(data.address).slice(2, 3).toUpperCase(), 105, 769);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(230,231,238,0.68)";
  ctx.font = "500 25px Inter, sans-serif";
  ctx.fillText(shortAddr(data.address), 146, 770);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(230,231,238,0.30)";
  ctx.font = "500 25px Inter, sans-serif";
  ctx.fillText("Portfolio Summary · Monad", WIDTH - 82, 770);
  ctx.textAlign = "left";
}

function drawBackground(ctx: CanvasRenderingContext2D, theme: ThemeId) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  if (theme === "aurora") {
    gradient.addColorStop(0, "#12382f");
    gradient.addColorStop(0.45, "#090d12");
    gradient.addColorStop(1, "#17122c");
  } else if (theme === "violet") {
    gradient.addColorStop(0, "#2a1f4f");
    gradient.addColorStop(0.48, "#0d0a18");
    gradient.addColorStop(1, "#06070b");
  } else if (theme === "graph") {
    gradient.addColorStop(0, "#20232b");
    gradient.addColorStop(0.55, "#0d0f14");
    gradient.addColorStop(1, "#06070a");
  } else {
    gradient.addColorStop(0, "#13254d");
    gradient.addColorStop(0.48, "#090d18");
    gradient.addColorStop(1, "#050609");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (theme === "graph") {
    ctx.strokeStyle = "rgba(160,145,240,0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    return;
  }

  const glow = ctx.createRadialGradient(650, 440, 0, 650, 440, 520);
  glow.addColorStop(0, theme === "aurora" ? "rgba(119,199,175,0.19)" : "rgba(124,111,240,0.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let index = 0; index < 145; index++) {
    const x = seeded(index * 13 + 7) * WIDTH;
    const y = seeded(index * 29 + 11) * HEIGHT;
    const radius = 0.7 + seeded(index * 47 + 5) * 2.1;
    ctx.fillStyle = `rgba(230,231,238,${0.08 + seeded(index * 61 + 3) * 0.24})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.font = "600 26px Inter, sans-serif";
  const width = ctx.measureText(label).width + 42;
  ctx.fillStyle = "rgba(160,145,240,0.15)";
  ctx.strokeStyle = "rgba(160,145,240,0.32)";
  roundRect(ctx, x, y - 35, width, 52, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c4bcff";
  ctx.fillText(label, x + 21, y + 1);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
) {
  let size = initialSize;
  while (size > 25) {
    ctx.font = `700 ${size}px Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.fillText(text, x, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function signedUsd(value: number) {
  return `${value >= 0 ? "+" : "−"}${fmtUsd(Math.abs(value))}`;
}

function seeded(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

let logoPromise: Promise<HTMLImageElement> | null = null;
function loadLogo() {
  logoPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the MonTerminal logo"));
    image.src = "/monterminal-mark.svg";
  });
  return logoPromise;
}
