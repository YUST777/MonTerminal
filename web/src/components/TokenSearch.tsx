import { useState } from "react";
import { useMarketLookup } from "../hooks/market.ts";
import { useTerminal } from "../state/terminal.ts";
import { useToasts } from "./Toasts.tsx";

/** Paste a token address → resolve ERC-20 meta + deepest TOKEN/WMON pool. */
export function TokenSearch() {
  const [query, setQuery] = useState("");
  const { data, isFetching, error } = useMarketLookup(query);
  const setMarket = useTerminal((s) => s.setMarket);
  const push = useToasts((s) => s.push);

  const select = () => {
    if (!data) return;
    setMarket(data.token, data.pool);
    setQuery("");
    push("info", `Loaded ${data.token.symbol}/${data.pool.quote.symbol} (${data.pool.fee / 10_000}% pool)`);
  };

  return (
    <div className="relative w-96">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Paste token address (0x…)"
        spellCheck={false}
        className="w-full rounded border border-line bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand"
      />
      {query && (
        <div className="absolute top-full z-20 mt-1 w-full rounded border border-line bg-overlay text-sm shadow-xl">
          {isFetching && <div className="px-3 py-2 text-muted">Looking up…</div>}
          {error && <div className="px-3 py-2 text-down">{(error as Error).message}</div>}
          {data && (
            <button
              onClick={select}
              className="flex w-full items-center justify-between px-3 py-2 hover:bg-raised"
            >
              <span>
                <span className="font-semibold">{data.token.symbol}</span>
                <span className="ml-2 text-muted">{data.token.name}</span>
              </span>
              <span className="text-muted">
                /{data.pool.quote.symbol} · {data.pool.fee / 10_000}% pool
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
