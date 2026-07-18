import { useState } from "react";
import { Check, Clipboard, ExternalLink, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTokenBalance } from "../hooks/trade.ts";
import { useTokenMedia } from "../hooks/market.ts";
import { fmtAmount, shortAddr } from "../lib/format.ts";
import { navigate } from "../lib/router.ts";
import { useTerminal } from "../state/terminal.ts";
import { TokenIcon } from "./TokenIcon.tsx";

export function TokenOverview({ error }: { error?: string }) {
  const { token, marketNotice } = useTerminal();
  const { data: media } = useTokenMedia(token?.address);
  const { data: balance } = useTokenBalance(token?.address);
  const [copied, setCopied] = useState(false);

  if (error || !token) {
    return (
      <div className="h-full overflow-y-auto px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-xl rounded-xl border border-down/30 bg-down/5 p-5 sm:p-7">
          <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-down/10 text-down">
            <TriangleAlert className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">This is not a Monad ERC-20</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {error ?? "The contract could not be inspected."}
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
          >
            <Search className="size-4" />
            Browse tokens
          </button>
        </div>
      </div>
    );
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(token.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-xl border border-line bg-raised/40 p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <TokenIcon url={media?.icon} symbol={token.symbol} size="size-12 sm:size-14" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{token.name}</h1>
                <span className="rounded-full bg-up/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-up">
                  Detected
                </span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-muted">{token.symbol} · Monad ERC-20</p>
            </div>
          </div>

          {media?.description && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">{media.description}</p>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Detail label="Network" value="Monad mainnet" />
            <Detail label="Decimals" value={String(token.decimals)} />
            <Detail
              label="Wallet balance"
              value={balance === undefined ? "Connect wallet to view" : `${fmtAmount(balance, token.decimals)} ${token.symbol}`}
            />
            <Detail label="Token standard" value="ERC-20" />
          </div>

          <div className="mt-3 rounded-lg border border-line bg-bg p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Contract address</div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-fg sm:text-sm">{token.address}</code>
              <button
                onClick={copyAddress}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:border-brand hover:text-fg"
                title="Copy contract address"
              >
                {copied ? <Check className="size-3.5 text-up" /> : <Clipboard className="size-3.5" />}
              </button>
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-warn/30 bg-warn/5 p-4 sm:p-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-warn/10 text-warn">
            <ShieldCheck className="size-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Contract found, route not found</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {marketNotice ?? "This token has no liquidity pool supported by MonTerminal yet."}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            MonTerminal will never invent a pool or fake a quote. Buy, sell, charts, and orders unlock automatically when the token has real liquidity on a supported factory.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:flex-col">
            <a
              href={`https://monadscan.com/token/${token.address}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
            >
              View on MonadScan
              <ExternalLink className="size-3.5" />
            </a>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-bg px-4 py-2 text-sm font-semibold hover:border-brand"
            >
              <Search className="size-3.5" />
              Browse liquid markets
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>{value}</div>
    </div>
  );
}
