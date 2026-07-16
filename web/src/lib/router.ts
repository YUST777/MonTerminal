import { useSyncExternalStore } from "react";

/**
 * Micro client-side router — the app only has three path shapes
 * (`/`, `/bridge`, `/token/monad/0x…`), so history + one store beats a
 * router dependency.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

/** Push a new path (back button works) and re-render subscribers. */
export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  emit();
}

/** Replace the current path without a history entry (URL mirroring). */
export function replacePath(path: string) {
  if (window.location.pathname === path) return;
  window.history.replaceState(null, "", path);
  emit();
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
