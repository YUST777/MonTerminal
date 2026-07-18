import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MonTerminal Docs",
  description: "User, developer, and AI-agent documentation for MonTerminal on Monad Mainnet.",
  lang: "en-US",
  base: "/docs/",
  outDir: "../web/public/docs",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://www.monterminal.fun/docs/",
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
