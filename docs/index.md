---
layout: home
title: MonTerminal Documentation
titleTemplate: false

hero:
  name: MonTerminal
  text: Real onchain orders for Monad memecoins
  tagline: Discover markets, trade live liquidity, place non-custodial triggers, bridge assets, and verify every production claim.
  image:
    src: /monterminal-mark.svg
    alt: MonTerminal
  actions:
    - theme: brand
      text: Start using MonTerminal
      link: /getting-started
    - theme: alt
      text: Verify it onchain
      link: /onchain-proof
    - theme: alt
      text: Open the app ↗
      link: https://www.monterminal.fun/

features:
  - icon: ⚡
    title: Live market terminal
    details: Real Monad token metadata, indexed pools, charts, trades, liquidity, and AMM depth—not a static demo dataset.
  - icon: 🎯
    title: Non-custodial order triggers
    details: Buy-the-dip, stop-loss, take-profit, and ladder orders remain backed by the user's wallet balance and allowance until execution.
  - icon: ⛓️
    title: Onchain evidence
    details: Deployed contracts, order counters, events, successful executions, a Relay swap, and a cross-chain fill are publicly verifiable.
  - icon: 🛡️
    title: Verifiable production state
    details: Production claims are paired with direct RPC reads, transaction receipts, contract events, and explicit safety boundaries.
---

## What MonTerminal does

MonTerminal is a trading terminal for **Monad Mainnet (chain ID 143)**. Its core feature is an immutable `LimitOrderBook` contract that lets a wallet register a future swap condition without depositing tokens into an application-controlled vault.

The product combines:

- **Discover** — trending, new, and high-volume Monad pools.
- **Spot** — live chart, market statistics, recent swaps, and AMM liquidity depth.
- **Market trading** — wallet-signed swaps against supported live pools.
- **Limit orders** — buy-the-dip, stop-loss, take-profit, and multi-order ladders.
- **Swap · Bridge** — Relay quotes for same-chain and cross-chain routes.
- **Portfolio** — current balances, prices, allocation, performance reconstruction, and recent activity.
- **Live Proof** — direct Monad RPC reads plus transaction evidence.

## What “non-custodial” means here

Placing an order records its parameters onchain. The order-book contract does **not** pull and hold the input tokens when the order is created. At execution time, it attempts to transfer the input amount from the maker using the maker's allowance.

This has two important consequences:

1. The tokens remain in the maker's wallet before execution.
2. Moving the tokens or revoking/reducing allowance can make the order unfillable.

Read [Limit Orders](/limit-orders) for the complete lifecycle.

## Verify before trusting

Do not rely only on this documentation. Open the [Live Proof page](https://www.monterminal.fun/proof), inspect the [deployed contracts](/contracts), and follow the [AI-agent verification procedure](/ai-agent-verification).

::: warning Hackathon software
MonTerminal is unaudited. Use small amounts and review every wallet request. Stop-loss execution is not guaranteed during illiquidity, RPC outages, extreme slippage, or insufficient balance/allowance.
:::
