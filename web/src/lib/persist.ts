import { useState } from "react";

/**
 * Tiny localStorage persistence for UI choices — selected tabs, timeframes,
 * bridge pair, last market — so a reload puts the terminal back exactly where
 * it was. Storage failures (quota, private mode) silently fall back to
 * in-memory state; a corrupt or outdated value falls back to the default.
 */

const PREFIX = "monolimit.ui:";

export function loadPersisted<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function savePersisted(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode — state stays in memory only */
  }
}

/**
 * Drop-in useState that survives reloads. `isValid` guards against stale
 * stored values (renamed tabs, removed options) — invalid ones are ignored.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid?: (v: T) => boolean,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = loadPersisted<T>(key);
    if (stored == null) return initial;
    return isValid && !isValid(stored) ? initial : stored;
  });
  const set = (v: T | ((prev: T) => T)) =>
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v;
      savePersisted(key, next);
      return next;
    });
  return [value, set];
}
