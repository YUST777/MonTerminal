import type { HistoryPoint, HistoryRange } from "../../hooks/portfolio.ts";
import { fmtUsd } from "../../lib/format.ts";

/**
 * Pure-SVG portfolio value chart: brand-purple line over a soft gradient
 * fill, optional dashed MON benchmark + $/date axes (Performance Overview).
 * Data is real holdings-value history — see useHoldingsHistory.
 */
export function ValueChart({
  points,
  range,
  id,
  axes = false,
  masked = false,
  className = "",
}: {
  points: HistoryPoint[];
  range: HistoryRange;
  /** unique gradient id — SVG defs are document-global */
  id: string;
  axes?: boolean;
  masked?: boolean;
  className?: string;
}) {
  const W = axes ? 820 : 400;
  const H = axes ? 230 : 74;
  const padL = axes ? 50 : 2;
  const padR = axes ? 10 : 2;
  const padT = 10;
  const padB = axes ? 22 : 4;

  const values = points.flatMap((p) => (p.bench != null && axes ? [p.value, p.bench] : [p.value]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  // breathing room so the line never kisses the frame
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;

  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${padL},${(H - padB).toFixed(1)} ${line} ${x(points.length - 1).toFixed(1)},${(H - padB).toFixed(1)}`;
  const bench = points.every((p) => p.bench != null)
    ? points.map((p, i) => `${x(i).toFixed(1)},${y(p.bench!).toFixed(1)}`).join(" ")
    : null;

  const yTicks = axes ? [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4) : [];
  const xTicks = axes
    ? [0, 1, 2, 3, 4, 5].map((i) => Math.round((i / 5) * (points.length - 1)))
    : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      // the mini chart stretches to fill its slot; the axes chart keeps its
      // aspect so tick text isn't distorted
      preserveAspectRatio={axes ? "xMidYMid meet" : "none"}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {axes &&
        yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth="1"
              strokeDasharray="3 5"
              opacity="0.6"
            />
            <text
              x={padL - 8}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="10"
              style={{ fill: "var(--color-muted)" }}
            >
              {masked ? "•••" : fmtUsd(v)}
            </text>
          </g>
        ))}
      <polygon points={area} fill={`url(#${id})`} />
      {bench && (
        <polyline
          points={bench}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="1.3"
          strokeDasharray="4 4"
          opacity="0.7"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={axes ? 1.8 : 1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {axes &&
        xTicks.map((idx, i) => (
          <text
            key={i}
            x={x(idx)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize="10"
            style={{ fill: "var(--color-muted)" }}
          >
            {tickLabel(points[idx]!.ts, range)}
          </text>
        ))}
    </svg>
  );
}

function tickLabel(tsSec: number, range: HistoryRange): string {
  const d = new Date(tsSec * 1000);
  return range === "1D"
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
