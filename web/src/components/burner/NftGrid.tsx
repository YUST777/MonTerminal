import { useNftBurn, useNftScan } from "../../hooks/burner.ts";
import { shortAddr } from "../../lib/format.ts";
import { FlameGlyph } from "./BurnerPage.tsx";

/** NFTs tab — 721s received recently and still owned, burnable one by one. */
export function NftGrid() {
  const scan = useNftScan();
  const { burn, burning } = useNftBurn();

  if (scan.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-32 rounded-lg" />
        ))}
      </div>
    );
  }
  const nfts = scan.data ?? [];
  if (nfts.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted">
        No NFTs received in the last ~24h — older ones need an indexer Monad doesn't have yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {nfts.map((n) => {
        const key = `${n.contract}:${n.tokenId}`;
        const busy = burning === key;
        return (
          <div
            key={key}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-bg/50 p-3"
          >
            <span className="truncate text-[13px] font-semibold">{n.collection}</span>
            <span className="text-[11px] text-muted">#{String(n.tokenId)}</span>
            <a
              href={`https://monadscan.com/token/${n.contract}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-muted hover:text-brand"
            >
              {shortAddr(n.contract)} ↗
            </a>
            <button
              onClick={() => burn(n)}
              disabled={burning != null}
              className="mt-1 flex items-center justify-center gap-1.5 rounded-md bg-down/10 py-1.5 text-[11px] font-semibold text-down enabled:hover:bg-down enabled:hover:text-bg disabled:opacity-40"
            >
              <FlameGlyph className="size-3" /> {busy ? "Burning…" : "Burn"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
