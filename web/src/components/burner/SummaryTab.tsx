import { useBurnHistory } from "../../hooks/burner.ts";
import { fmtAge, fmtAmountNum } from "../../lib/format.ts";
import { FlameGlyph } from "./BurnerPage.tsx";

/** Summary tab — the wallet's real burn history (transfers to 0x…dEaD). */
export function SummaryTab() {
  const history = useBurnHistory();

  if (history.isLoading) {
    return (
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="skeleton h-10 rounded-md" />
        ))}
      </div>
    );
  }
  const records = history.data ?? [];
  if (records.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted">
        No burns from this wallet in the last ~24h. Select some dust and light it up. 🔥
      </div>
    );
  }
  return (
    <div className="flex flex-col p-2">
      {records.map((r) => (
        <a
          key={`${r.tx}-${r.symbol}-${r.amount}`}
          href={`https://monadscan.com/tx/${r.tx}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-overlay/40"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-down/10 text-down">
            <FlameGlyph className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold">Burned {r.symbol}</span>
            <span className="text-[11px] text-muted">{fmtAge(r.tsSec)} ago</span>
          </span>
          <span className="text-xs font-medium tabular-nums text-down">
            −{fmtAmountNum(r.amount)} {r.symbol}
          </span>
        </a>
      ))}
    </div>
  );
}
