import { useState } from "react";
import { useAccount } from "wagmi";

/**
 * Bridge-in helper. Cross-chain bridging needs the user's wallet connected to
 * the ORIGIN chain, so the cleanest non-custodial path is Relay's own bridge
 * UI pre-filled for Monad — opened in a new tab with the user's address.
 */
export function BridgeModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] rounded-lg border border-line bg-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-lg font-semibold">Get MON on Monad</div>
        <p className="mb-4 text-sm text-muted">
          Bridge from any chain with Relay — funds arrive as native MON in seconds.
        </p>
        {address && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mb-4 w-full rounded border border-line bg-bg px-3 py-2 text-left text-xs text-muted hover:border-brand"
          >
            {copied ? "copied ✓" : address}
          </button>
        )}
        <a
          href="https://relay.link/bridge/monad"
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded bg-brand py-2 text-center text-sm font-semibold text-bg hover:opacity-90"
        >
          Open Relay bridge ↗
        </a>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-muted hover:text-fg">
          close
        </button>
      </div>
    </div>
  );
}
