import { useEffect, useRef } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { monad } from "@monolimit/shared";
import { usePathname } from "../lib/router.ts";

/**
 * Keeps the wallet on Monad mainnet (143). The moment a wrong chain is
 * detected it prompts the wallet to switch back automatically — the banner
 * only lingers if the user rejects the prompt. The bridge page is exempt:
 * funding from Ethereum/Base/… legitimately needs the wallet elsewhere.
 */
export function NetworkGuard() {
  const path = usePathname();
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const onBridge = path === "/bridge" || path === "/swap";
  const wrong = isConnected && chainId !== monad.id;
  // one auto-prompt per wrong-chain episode — never spam a rejecting user
  const prompted = useRef(false);

  useEffect(() => {
    if (!wrong) {
      prompted.current = false;
      return;
    }
    if (onBridge || prompted.current) return;
    prompted.current = true;
    switchChain({ chainId: monad.id });
  }, [wrong, onBridge, switchChain]);

  if (!wrong || onBridge) return null;
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
