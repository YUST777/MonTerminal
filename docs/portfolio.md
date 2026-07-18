# Portfolio

The Portfolio page describes the connected wallet's current onchain state. It does not maintain an application-controlled balance ledger.

## Data flow

1. Discover wallet token activity and the supported token universe.
2. Read live token balances through Monad RPC multicalls.
3. Resolve prices through indexed market providers.
4. Calculate current value and allocation in the browser.
5. Reconstruct historical performance from current holdings multiplied by real historical token prices.

## What the chart means

The performance chart is **not** an archived snapshot of the wallet's past balances. It reconstructs how the wallet's **current holdings** would have valued across the selected period using historical prices.

This is useful for understanding current-basket performance, but it is not tax accounting and not a complete historical net-worth ledger.

## Recent activity

Recent token transfers are grouped by transaction. A transaction containing both outgoing and incoming transfers can be classified as a swap.

If the explorer/indexer is unavailable, the portfolio falls back to a known-token balance scan. This can miss an obscure token until it is discovered by the application's token universe.

## Cached data

Market history may be cached locally and in the shared Supabase cache to improve load time. Wallet balances are still read from chain; cached market data does not create or fake token balances.

## Privacy

Connecting a public wallet address allows the browser and upstream providers to observe queries associated with that address. MonTerminal does not ask for a seed phrase or private key.
