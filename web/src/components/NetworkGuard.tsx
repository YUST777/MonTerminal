import { useAccount, useSwitchChain } from "wagmi";
import { monad } from "@monolimit/shared";

/** Forces the wallet onto Monad (chain 143) before anything on-chain happens. */
export function NetworkGuard() {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === monad.id) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">
      <span>Wrong network — MonoLimit runs on Monad mainnet (143).</span>
      <button
        onClick={() => switchChain({ chainId: monad.id })}
        disabled={isPending}
        className="rounded border border-warn px-3 py-1 hover:bg-warn/20 disabled:opacity-50"
      >
        {isPending ? "Switching…" : "Switch to Monad"}
      </button>
    </div>
  );
}
