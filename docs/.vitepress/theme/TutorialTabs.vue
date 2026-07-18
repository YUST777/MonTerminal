<script setup lang="ts">
import { ref } from "vue";

const tutorials = [
  {
    label: "1. Terminal",
    title: "Trade and place onchain orders",
    description: "Discover a token, understand the live terminal, make a market trade, then place and verify a limit buy or limit sell.",
    image: "/docs/tutorial-terminal.svg",
    alt: "SVG placeholder showing the MonTerminal spot terminal",
    steps: ["Open a verified market", "Read chart and AMM depth", "Approve the exact order amount", "Place and verify the order"],
  },
  {
    label: "2. Swap · Bridge",
    title: "Quote, review, and follow a Relay route",
    description: "Choose origin and destination assets, inspect provider fees and minimum received, sign the source action, and follow the fill status.",
    image: "/docs/tutorial-swap-bridge.svg",
    alt: "SVG placeholder showing a swap and cross-chain bridge route",
    steps: ["Select both chains and tokens", "Review impact and minimum received", "Sign on the origin chain", "Confirm the destination fill"],
  },
  {
    label: "3. Portfolio",
    title: "Understand wallet balances and performance",
    description: "Read current holdings, allocation, reconstructed performance, token-level trends, and grouped recent onchain activity.",
    image: "/docs/tutorial-portfolio.svg",
    alt: "SVG placeholder showing the MonTerminal portfolio dashboard",
    steps: ["Connect the wallet", "Review total value and allocation", "Change the chart range", "Inspect assets and recent activity"],
  },
] as const;

const active = ref(0);
</script>

<template>
  <div class="tutorial-shell">
    <div class="tutorial-tabs" role="tablist" aria-label="MonTerminal tutorials">
      <button
        v-for="(tutorial, index) in tutorials"
        :id="`tutorial-tab-${index}`"
        :key="tutorial.label"
        type="button"
        role="tab"
        :aria-selected="active === index"
        :aria-controls="`tutorial-panel-${index}`"
        :class="{ active: active === index }"
        @click="active = index"
      >
        {{ tutorial.label }}
      </button>
    </div>

    <div
      :id="`tutorial-panel-${active}`"
      class="tutorial-panel"
      role="tabpanel"
      :aria-labelledby="`tutorial-tab-${active}`"
    >
      <div class="tutorial-visual">
        <img :src="tutorials[active].image" :alt="tutorials[active].alt" />
        <span>Video placeholder · replace with your final walkthrough</span>
      </div>
      <div class="tutorial-copy">
        <span class="tutorial-number">Tutorial {{ active + 1 }} of {{ tutorials.length }}</span>
        <h2>{{ tutorials[active].title }}</h2>
        <p>{{ tutorials[active].description }}</p>
        <ol>
          <li v-for="step in tutorials[active].steps" :key="step">{{ step }}</li>
        </ol>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tutorial-shell { margin-top: 24px; overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 16px; background: var(--vp-c-bg-soft); }
.tutorial-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--vp-c-divider); }
.tutorial-tabs button { border: 0; border-radius: 0; padding: 13px 10px; background: var(--vp-c-bg); color: var(--vp-c-text-2); font-size: 12px; font-weight: 700; cursor: pointer; }
.tutorial-tabs button:hover { color: var(--vp-c-text-1); }
.tutorial-tabs button.active { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); box-shadow: inset 0 -2px var(--vp-c-brand-1); }
.tutorial-panel { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(260px, .75fr); }
.tutorial-visual { position: relative; min-height: 360px; padding: 20px; background: #0b0c11; }
.tutorial-visual img { display: block; width: 100%; height: 100%; min-height: 320px; object-fit: contain; }
.tutorial-visual span { position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); width: max-content; max-width: calc(100% - 40px); border: 1px solid rgba(255,255,255,.13); border-radius: 999px; padding: 6px 10px; background: rgba(11,12,17,.84); color: var(--vp-c-text-2); font-size: 11px; text-align: center; }
.tutorial-copy { padding: 30px; }
.tutorial-number { color: var(--vp-c-brand-1); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.tutorial-copy h2 { margin: 12px 0 10px; border: 0; padding: 0; font-size: 25px; line-height: 1.2; }
.tutorial-copy p { margin: 0; color: var(--vp-c-text-2); font-size: 14px; line-height: 1.65; }
.tutorial-copy ol { margin: 20px 0 0; padding-left: 20px; }
.tutorial-copy li { margin: 8px 0; color: var(--vp-c-text-2); font-size: 13px; }
@media (max-width: 760px) {
  .tutorial-tabs { grid-template-columns: 1fr; }
  .tutorial-panel { grid-template-columns: 1fr; }
  .tutorial-visual { min-height: 250px; padding: 12px; }
  .tutorial-visual img { min-height: 225px; }
  .tutorial-copy { padding: 22px; }
}
</style>
