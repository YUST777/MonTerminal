# Contracts

## LimitOrderBook

Each supported DEX has a dedicated `LimitOrderBook` deployment with the same order semantics and a router appropriate to that pool family.

Core externally visible operations include:

- `placeOrder` / `placeOrders` — register one or multiple wallet-backed orders;
- `cancelOrder` / `cancelOrders` — cancel maker-owned open orders;
- `executeOrder` — permissionlessly attempt a triggered swap;
- `getOrders` — read stored order structs;
- `nextOrderId` — monotonic placement counter.

Core events include:

- `OrderPlaced`;
- `OrderCancelled`;
- `OrderExecuted`.

## ForkRouter

Capricorn and PancakeSwap v3 use fork-specific pool behavior. `ForkRouter` discovers the pool through the configured factory and authenticates callbacks by requiring the caller to equal the factory's real pool for the token pair and fee.

## Mainnet addresses

| Contract | Address |
|---|---|
| LimitOrderBook — Uniswap v3 | [`0x595368DffF28eC08718Ca620EC9a981772628425`](https://monadscan.com/address/0x595368DffF28eC08718Ca620EC9a981772628425) |
| LimitOrderBook — Capricorn | [`0x07E94F44c89b648a36c7cd5408b52D76880857f7`](https://monadscan.com/address/0x07E94F44c89b648a36c7cd5408b52D76880857f7) |
| ForkRouter — Capricorn | [`0xd950EeB0063Ddc186b314113b199C1A675930686`](https://monadscan.com/address/0xd950EeB0063Ddc186b314113b199C1A675930686) |
| LimitOrderBook — PancakeSwap v3 | [`0x1672DB600D0c0213b3971F30438482Ea2Afaf53F`](https://monadscan.com/address/0x1672DB600D0c0213b3971F30438482Ea2Afaf53F) |
| ForkRouter — PancakeSwap v3 | [`0x46dEc159b5B126f458f16c41E900137d6cAe3F24`](https://monadscan.com/address/0x46dEc159b5B126f458f16c41E900137d6cAe3F24) |
| WMON | [`0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`](https://monadscan.com/token/0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A) |

## Trigger enforcement

### Take profit / buy limit

The configured `minAmountOut` is a hard swap condition. If the pool cannot return that amount, the transaction reverts.

### Stop loss

The contract checks a time-weighted pool tick before allowing execution, then enforces an output minimum derived from the TWAP quote and maximum slippage. This reduces dependence on a single manipulable spot observation.

## Test coverage

The Foundry suite contains 33 passing fork tests covering:

- placement and cancellation;
- batch orders;
- take-profit and stop-loss execution;
- TWAP gating and flash-dump resistance;
- slippage reverts;
- expiry and double-execution protection;
- native payout and WMON fallback;
- fee-on-transfer accounting;
- reentrancy protection;
- Capricorn and Pancake callback behavior.

Run the suite using [Run Locally](/run-locally#contracts).
