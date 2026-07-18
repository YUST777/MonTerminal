# APIs & Data

The frontend uses same-origin Vercel functions for services that would otherwise expose browser CORS, provider fallback, or runtime-secret problems.

## `/api/rpc`

Accepts JSON-RPC POST requests and forwards approved public methods to a configured Monad RPC fallback list.

Used for:

- chain ID and block number;
- bytecode and ERC-20 metadata;
- balances and allowances;
- pool and factory reads;
- order state and events;
- transaction preparation and post-transaction reads.

The browser never receives the upstream `RPC_URLS` environment variable.

## `/api/gecko`

Proxies a validated GeckoTerminal API path. Used for discovery, pool market data, candles, and recent trades.

Example:

```text
/api/gecko?path=/api/v2/networks/monad/trending_pools?include=base_token&duration=24h
```

## `/api/portfolio-history`

Returns real historical market data used to reconstruct the current wallet basket over supported ranges. It does not return a fabricated wallet balance archive.

## `/api/order-intent`

Converts a natural-language order request into a schema-constrained intent draft through the configured model provider.

The model does not:

- access the wallet;
- sign transactions;
- calculate final calldata;
- bypass allocation or balance checks;
- place an order without user review.

## `/api/capabilities`

Reports runtime availability for optional capabilities. This lets the UI adapt before a user starts an action.

## Direct third-party services

| Provider | Purpose |
|---|---|
| Relay | Route quotes, execution steps, and fill status |
| DexScreener | Supplemental token/pair lookup and prices |
| Supabase | Shared non-wallet market-data cache |

## Failure behavior

Provider errors are not converted into fake successful results. The UI distinguishes RPC failures, invalid contracts, missing pools, rate limits, unsupported routes, and too-small amounts.
