/** Compact human formatting for prices, amounts and percentages. */

export function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p === 0) return "0";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  // sub-penny meme prices: 0.0₅123 style
  const exp = Math.ceil(-Math.log10(p)) - 1;
  const digits = Math.round(p * 10 ** (exp + 4));
  return `0.0${subscript(exp)}${digits}`;
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
function subscript(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUBS[Number(c)])
    .join("");
}

export function fmtAmount(raw: bigint, decimals: number, maxDp = 4): string {
  return fmtAmountNum(Number(raw) / 10 ** decimals, maxDp);
}

export function fmtAmountNum(v: number, maxDp = 4): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: maxDp });
}

export function fmtPct(p: number, signed = true): string {
  const s = signed && p > 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

/** $1.61B / $12.4M / $63,344 / $0.0₅123 — hypeterminal-style compact USD. */
export function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 10_000) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (abs >= 1) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${fmtPrice(v)}`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortHash(h: string): string {
  return `${h.slice(0, 10)}…`;
}

export function parseAmount(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!t || !/^\d*\.?\d*$/.test(t)) return null;
  const [whole = "0", frac = ""] = t.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}
