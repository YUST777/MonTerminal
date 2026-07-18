import { useEffect } from "react";
import { usePathname } from "../lib/router.ts";
import { useTerminal } from "../state/terminal.ts";

const ORIGIN = "https://www.monterminal.fun";
const SOCIAL_IMAGE = `${ORIGIN}/md/banner.webp`;

function ensureMeta(selector: string, attributes: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    document.head.appendChild(element);
  }
  element.content = content;
}

function ensureCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

export function RouteMetadata() {
  const path = usePathname();
  const token = useTerminal((state) => state.token);

  useEffect(() => {
    const terminal = /^\/token\/monad\/0x[0-9a-fA-F]{40}$/.test(path);
    const page = path === "/swap" || path === "/bridge"
      ? {
          title: "Swap & Bridge | MonTerminal",
          description: "Get live Relay routes for same-chain swaps and cross-chain bridges with fees, price impact, minimum received, and fill status.",
        }
      : path === "/portfolio"
        ? {
            title: "Monad Portfolio | MonTerminal",
            description: "Inspect live Monad wallet balances, allocation, reconstructed performance, token prices, and recent onchain activity.",
          }
        : path === "/proof"
          ? {
              title: "Live Onchain Proof | MonTerminal",
              description: "Verify Monad chain data, deployed order-book bytecode, order counters, recent events, and real limit-order, swap, and bridge transactions.",
            }
          : terminal
            ? {
                title: `${token?.symbol ?? "Monad Token"} Trading Terminal | MonTerminal`,
                description: `Trade ${token?.name ?? "a Monad token"} using live pool data, AMM depth, wallet-signed swaps, and non-custodial onchain order triggers.`,
              }
            : {
                title: "Discover Monad Memecoins | MonTerminal",
                description: "Discover trending, new, and high-volume Monad pools with live prices, liquidity, volume, market cap, and transaction activity.",
              };
    const canonical = `${ORIGIN}${path === "/bridge" ? "/swap" : path}`;

    document.title = page.title;
    ensureCanonical(canonical);
    ensureMeta('meta[name="description"]', { name: "description" }, page.description);
    ensureMeta('meta[property="og:title"]', { property: "og:title" }, page.title);
    ensureMeta('meta[property="og:description"]', { property: "og:description" }, page.description);
    ensureMeta('meta[property="og:url"]', { property: "og:url" }, canonical);
    ensureMeta('meta[property="og:image"]', { property: "og:image" }, SOCIAL_IMAGE);
    ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" }, page.title);
    ensureMeta('meta[name="twitter:description"]', { name: "twitter:description" }, page.description);
    ensureMeta('meta[name="twitter:image"]', { name: "twitter:image" }, SOCIAL_IMAGE);

    let schema = document.head.querySelector<HTMLScriptElement>("#route-structured-data");
    if (!schema) {
      schema = document.createElement("script");
      schema.id = "route-structured-data";
      schema.type = "application/ld+json";
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": terminal ? "WebPage" : "WebApplication",
      name: page.title,
      description: page.description,
      url: canonical,
      isPartOf: { "@type": "WebSite", name: "MonTerminal", url: ORIGIN },
      about: { "@type": "Thing", name: "Monad Mainnet", identifier: "eip155:143" },
    });
  }, [path, token?.name, token?.symbol]);

  return null;
}
