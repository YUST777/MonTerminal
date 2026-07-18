# Discover & Spot

## Discover

The Discover page is the market entry point. It requests indexed Monad pool data through MonTerminal's GeckoTerminal gateway and shows three views:

- **Trending** — pools receiving current interest.
- **New pairs** — recently indexed pools.
- **Top volume** — pools ordered by trading activity.

Rows may include token identity, pair age, price change, volume, liquidity, market capitalization, and transaction counts. Selecting a row opens a deep-linked token terminal.

## Token verification

Opening a token is not just a UI route. The client uses Monad RPC to:

1. call `eth_getCode` for the address;
2. read standard ERC-20 metadata;
3. find indexed pools;
4. verify supported pool/factory relationships;
5. choose the deepest supported market.

A truthful error appears if any required stage fails. A valid ERC-20 without supported liquidity is not described as an invalid token.

## Spot terminal

The terminal combines several independent live sources:

| Surface | Source |
|---|---|
| Token metadata and balances | Monad RPC |
| Pool identity and liquidity state | Monad RPC + factory checks |
| Candles and recent swaps | GeckoTerminal |
| Market discovery | GeckoTerminal |
| Supplemental price/pair lookup | DexScreener |
| AMM depth | Pool tick liquidity |

## AMM depth is not a user order book

The bid/ask ladder labelled **AMM Depth** is derived from concentrated-liquidity ticks in the selected pool. It is not a fabricated list of MonTerminal user orders.

Recent trades are indexed pool swaps. Open MonTerminal orders are shown separately in the Orders area.

## Direct-link examples

CHOG, the pair used for the published lifecycle proof:

```text
https://www.monterminal.fun/token/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777
```

An invalid address should display “No contract found at this address,” while an RPC outage should display a network-specific error with a retry action.
