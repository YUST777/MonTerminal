import { useEffect, useState } from "react";

/**
 * Live matchMedia — used to swap whole layouts (e.g. the terminal's resizable
 * panels vs the stacked mobile view) instead of mounting both and hiding one,
 * which would double-poll the chart and order book.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
