import { useState } from "react";

/**
 * Round token icon with letter-avatar fallback — used in the home lists,
 * market dropdown and token header. `url` comes from DexScreener/Gecko and
 * can be null or 404; either way we fall back to the first letter.
 */
export function TokenIcon({
  url,
  symbol,
  size = "size-6",
}: {
  url: string | null | undefined;
  symbol: string;
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`}
      />
    );
  }
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-overlay text-[10px] font-bold text-brand ring-1 ring-line`}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}
