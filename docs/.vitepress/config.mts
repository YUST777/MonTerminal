import { defineConfig } from "vitepress";

const descriptions: Record<string, string> = {
  "index.md": "Understand MonTerminal's live Monad markets, non-custodial onchain limit orders, swaps, bridges, portfolio views, and public proof.",
  "getting-started.md": "Connect a wallet, open a verified Monad market, trade safely, place an exact-approval order, and confirm the result onchain.",
  "safety.md": "Review MonTerminal's approval, stop-loss, bridge, malicious-token, wallet, and incident-response safety guidance.",
  "discover-and-spot.md": "Learn how MonTerminal discovers real Monad pools, verifies token contracts and factories, and renders live chart, trade, and AMM-depth data.",
  "limit-orders.md": "Learn the wallet-backed lifecycle for buy-the-dip, stop-loss, take-profit, ladder, cancellation, and permissionless execution orders.",
  "swap-and-bridge.md": "Understand Relay quote creation, route safety checks, same-chain swaps, cross-chain fills, fees, and published transaction proof.",
  "portfolio.md": "Understand live wallet balances, price joins, current-basket performance reconstruction, recent activity, caching, and limitations.",
  "onchain-proof.md": "Independently verify Monad chain ID, deployed bytecode, order counters, events, and immutable transaction evidence.",
  "ai-agent-verification.md": "A machine-oriented verification procedure, claims ledger, production path map, transaction set, and honest limitation list for MonTerminal.",
  "production-status.md": "Current production capability matrix, smoke-test coverage, truthful disabled states, and troubleshooting guidance.",
  "architecture.md": "Technical architecture, monorepo package map, external data flow, wallet and contract boundaries, and trust assumptions.",
  "contracts.md": "Deployed LimitOrderBook and ForkRouter addresses, trigger enforcement, public functions, events, and Foundry fork-test coverage.",
  "api-and-data.md": "Reference for MonTerminal's RPC, GeckoTerminal, portfolio-history, order-intent, capability APIs, data sources, and failure behavior.",
  "keeper.md": "Keeper event hydration, pool polling, trigger evaluation, simulation, nonce handling, configuration, and current hosting status.",
  "run-locally.md": "Install, run, test, build, preview, smoke-test, and operate the MonTerminal web app, docs, contracts, and keeper locally.",
};

function canonicalPath(relativePath: string) {
  return relativePath === "index.md" ? "/docs/" : `/docs/${relativePath.replace(/\.md$/, "")}`;
}

export default defineConfig({
  title: "MonTerminal Docs",
  titleTemplate: ":title | MonTerminal Docs",
  description: "User, developer, and AI-agent documentation for MonTerminal on Monad Mainnet.",
  lang: "en-US",
  base: "/docs/",
  outDir: "../web/public/docs",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://www.monterminal.fun/docs/",
  },
  transformPageData(pageData) {
    pageData.description = descriptions[pageData.relativePath] ?? pageData.description;
    return pageData;
  },
  transformHead({ pageData }) {
    const path = canonicalPath(pageData.relativePath);
    const canonical = `https://www.monterminal.fun${path}`;
    const title = pageData.relativePath === "index.md"
      ? "MonTerminal Documentation"
      : pageData.title
        ? `${pageData.title} | MonTerminal Docs`
        : "MonTerminal Docs";
    const description = descriptions[pageData.relativePath] ?? pageData.description;
    return [
      ["link", { rel: "canonical", href: canonical }],
      ["link", { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" }],
      ["link", { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "MonTerminal AI context" }],
      ["meta", { name: "robots", content: "index, follow, max-image-preview:large" }],
      ["meta", { name: "author", content: "MonTerminal" }],
      ["meta", { property: "og:type", content: "article" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: canonical }],
      ["meta", { property: "og:image", content: "https://www.monterminal.fun/md/banner.webp" }],
      ["meta", { property: "og:image:alt", content: "MonTerminal documentation and onchain proof" }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["meta", { name: "twitter:image", content: "https://www.monterminal.fun/md/banner.webp" }],
      [
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: pageData.title,
          description,
          url: canonical,
          dateModified: "2026-07-18",
          author: { "@type": "Organization", name: "MonTerminal" },
          publisher: { "@type": "Organization", name: "MonTerminal", url: "https://www.monterminal.fun/" },
          isPartOf: { "@type": "WebSite", name: "MonTerminal Docs", url: "https://www.monterminal.fun/docs/" },
          about: { "@type": "Thing", name: "Monad Mainnet", identifier: "eip155:143" },
        }),
      ],
    ];
  },
  head: [
    ["link", { rel: "icon", href: "/monterminal-mark.svg" }],
    ["meta", { name: "theme-color", content: "#101117" }],
    ["meta", { property: "og:site_name", content: "MonTerminal Docs" }],
  ],
  themeConfig: {
    logo: "/monterminal-mark.svg",
    siteTitle: "MonTerminal Docs",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Proof", link: "/onchain-proof" },
      { text: "AI Verification", link: "/ai-agent-verification" },
      { text: "Open App ↗", link: "https://www.monterminal.fun/" },
    ],
    sidebar: [
      {
        text: "Start Here",
        items: [
          { text: "What is MonTerminal?", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Safety", link: "/safety" },
        ],
      },
      {
        text: "Using the App",
        items: [
          { text: "Discover & Spot", link: "/discover-and-spot" },
          { text: "Limit Orders", link: "/limit-orders" },
          { text: "Swap & Bridge", link: "/swap-and-bridge" },
          { text: "Portfolio", link: "/portfolio" },
        ],
      },
      {
        text: "Verification",
        items: [
          { text: "Onchain Proof", link: "/onchain-proof" },
          { text: "AI-Agent Verification", link: "/ai-agent-verification" },
          { text: "Production Status", link: "/production-status" },
        ],
      },
      {
        text: "Technical",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Contracts", link: "/contracts" },
          { text: "APIs & Data", link: "/api-and-data" },
          { text: "Keeper", link: "/keeper" },
          { text: "Run Locally", link: "/run-locally" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/YUST777/MonTerminal" },
    ],
    editLink: {
      pattern: "https://github.com/YUST777/MonTerminal/edit/main/docs/:path",
      text: "Improve this page on GitHub",
    },
    footer: {
      message: "Unaudited hackathon software. Use small amounts.",
      copyright: "MonTerminal · Monad Mainnet",
    },
    outline: {
      level: [2, 3],
      label: "On this page",
    },
  },
});
