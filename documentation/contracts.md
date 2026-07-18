# Contracts

MonTerminal's contracts were built as a small, immutable execution layer rather than a custody system. The web application creates parameters and asks the wallet to sign; Solidity owns the final validation, order state, trigger enforcement, token movement, swap floor, fee split, and maker payout.

## Contract source layout

| Source | Responsibility |
|---|---|
| `contracts/src/LimitOrderBook.sol` | Order storage, placement validation, cancellation, execution, fees, and payout |
| `contracts/src/ForkRouter.sol` | Minimal exact-input router for v3-compatible fork factories |
| `contracts/src/libraries/PoolPriceLib.sol` | 60-second TWAP reads and tick-to-token quote conversion |
| `contracts/src/interfaces/ISwapRouter02.sol` | Small router interface used by the order book |
| `contracts/src/interfaces/IWMON.sol` | WMON deposit and withdrawal interface |
| `contracts/script/Deploy.s.sol` | Canonical Uniswap v3 book deployment |
| `contracts/script/DeployForkMarkets.s.sol` | Capricorn and PancakeSwap v3 router/book deployments |
| `contracts/test/LimitOrderBook.t.sol` | Main order lifecycle, trigger, accounting, payout, and security tests |
| `contracts/test/ForkRouter.t.sol` | Fork callback, routing, slippage, and real pool swap tests |

The contracts compile with Solidity `0.8.26` and use OpenZeppelin `SafeERC20` and `ReentrancyGuard` plus the official Uniswap v3 core interfaces and math libraries.

## Design invariants

The implementation starts from six invariants:

1. **No escrow at placement** — creating an order never transfers the maker's input tokens.
2. **No privileged operator** — there is no owner, pause key, upgrade proxy, or admin withdrawal.
3. **Permissionless execution** — any caller can attempt a triggered order and earn its bounded fee.
4. **Contract-enforced output** — a keeper cannot choose a weaker minimum output than the maker authorized.
5. **Real pool authentication** — a fork callback may collect payment only when the caller is the factory's actual pool for that pair and fee.
6. **Atomic state transition** — an order is marked executed before external token/router calls; any later revert rolls the entire transaction back.

## Order model

### Enums

```solidity
enum OrderKind { TakeProfit, StopLoss }
enum OrderStatus { Nonexistent, Open, Executed, Cancelled }
```

`TakeProfit` is also used for a buy-the-dip order because both use a hard output requirement as the final market proof. `StopLoss` adds a TWAP direction gate and a dynamic output floor.

### Maker input: `OrderParams`

| Field | Solidity type | Meaning |
|---|---|---|
| `tokenIn` | `address` | Token pulled from the maker during execution |
| `tokenOut` | `address` | Token returned by the pool |
| `poolFee` | `uint24` | v3 fee tier used to resolve the pool |
| `amountIn` | `uint128` | Maximum input amount requested from the maker |
| `minAmountOut` | `uint128` | Maker's hard minimum output and take-profit/buy trigger |
| `triggerTick` | `int24` | Tick threshold used for trigger direction and stop-loss gating |
| `maxSlippageBps` | `uint16` | Stop-loss haircut from the TWAP quote floor |
| `expiry` | `uint40` | Unix timestamp; zero means good until cancelled |
| `keeperFeeBps` | `uint16` | Executor fee request, clamped by the contract |
| `kind` | `OrderKind` | Take-profit/buy-limit or stop-loss behavior |
| `unwrapToNative` | `bool` | When output is WMON, attempt native MON payout |

### Stored order

The contract adds maker address, derived trigger direction, and status. The browser does not get to choose `triggerWhenTickBelow`; the contract derives it from the pool's token ordering and current market side so a malformed client cannot reverse the intended comparison.

## Immutable construction

Each deployment receives three constructor values:

```solidity
constructor(address factory_, address router_, address wmon_)
```

They become immutable `factory`, `router`, and `wmon` references. A separate book is deployed for each DEX family because pool discovery and swap callbacks are tied to that factory/router pair.

There is deliberately no constructor owner and no later setter. Changing a factory or router requires deploying a new book and explicitly updating the application registry; it cannot be silently changed for existing orders.

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

## How `placeOrders` is built

The UI prefers `placeOrders` even for one order so the same audited path supports atomic ladders. The function allocates all IDs first and validates each item before storage.

For every order, Solidity checks:

1. `amountIn` is non-zero.
2. `tokenIn` and `tokenOut` differ.
3. `minAmountOut` is non-zero.
4. `expiry` is zero or in the future.
5. `triggerTick` is inside Uniswap `TickMath` bounds.
6. `factory.getPool(tokenIn, tokenOut, poolFee)` returns a real pool.
7. Native unwrap is requested only when `tokenOut` is WMON.
8. Stop-loss slippage is non-zero and at most `MAX_SLIPPAGE_BPS`.

For stop losses, placement also calls:

```solidity
pool.increaseObservationCardinalityNext(TWAP_CARDINALITY);
```

This asks the pool to grow its observation buffer so a 60-second TWAP can become available. A fresh pool may still need time to accumulate observations; execution correctly reverts rather than substituting a spot price.

The keeper fee is clamped to the contract's minimum/maximum range instead of trusting the client. The stored status becomes `Open`, `nextOrderId` increments, and a complete `OrderPlaced` event is emitted for indexers and keepers.

No `transferFrom` occurs in this function. A successful placement proves that the order exists, not that future maker balance and allowance are guaranteed.

## Cancellation path

`cancelOrder` requires:

- `msg.sender` equals the stored maker;
- status is exactly `Open`.

It changes the status to `Cancelled` and emits `OrderCancelled`. `cancelOrders` repeats the same maker-protected logic for a batch.

Cancellation does not call the token contract. It therefore does not revoke allowance; the maker may separately revoke or reuse it.

## Execution path

`executeOrder` is `nonReentrant` and follows this order:

1. Load the order and require `Open` status.
2. Reject an expired order.
3. Resolve the pool again from the immutable factory.
4. Enforce the trigger rule.
5. Set status to `Executed` before external calls.
6. Pull `amountIn` with `safeTransferFrom`.
7. Measure the actual received balance delta for fee-on-transfer compatibility.
8. Approve the configured router for the measured amount.
9. Swap with a contract-computed `amountOutMinimum`.
10. Measure the actual output balance delta.
11. Split the bounded keeper fee.
12. Pay the maker and emit `OrderExecuted`.

If transfer, approval, routing, slippage, or payout logic reverts, EVM atomicity restores the prior open status and all balances.

### Why input uses a balance delta

Some ERC-20 tokens transfer less than the requested amount. Instead of assuming `amountIn` arrived, the book measures:

```text
received = balanceAfter - balanceBefore
```

The router receives exactly that measured value. This avoids approving or swapping tokens the book never received.

### Why output uses a balance delta

The book also measures token-out balance before and after the router call. This makes the emitted `amountOut`, keeper fee, and maker payout reflect the actual returned tokens rather than trusting an external return value alone.

## ForkRouter

Capricorn and PancakeSwap v3 use fork-specific pool behavior. `ForkRouter` discovers the pool through the configured factory and authenticates callbacks by requiring the caller to equal the factory's real pool for the token pair and fee.

### Why a custom router was needed

Canonical Uniswap periphery code commonly relies on a pool init-code hash. Forks may share pool behavior while using different bytecode hashes or callback selectors. A canonical router can therefore reject a legitimate fork pool or fail its callback.

`ForkRouter` avoids hard-coded pool-address derivation. It asks:

```solidity
factory.getPool(tokenIn, tokenOut, fee)
```

Then it calls the returned pool directly. The router supports:

- `uniswapV3SwapCallback`;
- `pancakeV3SwapCallback`;
- a fallback decoder for other selectors with the same `(int256,int256,bytes)` payload, including Capricorn.

The callback selector is not the security boundary. `_pay` authenticates:

```solidity
msg.sender == factory.getPool(tokenIn, tokenOut, fee)
```

Only that genuine pool may pull payment from the order book into the pool. An arbitrary contract calling a recognized or unknown callback selector fails with `BadCallback`.

The router itself is stateless and should not retain balances. It pulls `tokenIn` from the calling book directly into the authenticated pool and leaves output delivery to the pool's recipient parameter.

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

The window is fixed at `TWAP_WINDOW = 60` seconds. `PoolPriceLib.twapTick` calls `pool.observe([60, 0])`, divides the cumulative tick delta by 60, and rounds negative values toward negative infinity to match Uniswap oracle semantics.

At execution, the book calculates:

```text
twapQuote = quoteAtTick(twapTick, receivedInput)
dynamicFloor = twapQuote × (10,000 - maxSlippageBps) / 10,000
amountOutMinimum = max(dynamicFloor, maker.minAmountOut)
```

This means neither the keeper nor router can weaken the maker's explicit minimum, and a crash-time swap must still respect the maximum slippage budget relative to the TWAP.

## Native MON payout

If `unwrapToNative=true` and output is WMON, the book withdraws WMON and sends native MON to the maker with a bounded gas stipend.

If the maker is a contract that rejects native currency, the book re-wraps the amount and pays WMON instead. Recipient behavior cannot permanently grief an otherwise valid execution.

## Keeper pre-check vs final proof

`isExecutable` is a cheap helper for offchain executors:

- stop loss: attempts the TWAP comparison;
- take profit: compares current spot tick as a hint.

It is not an authorization shortcut. `executeOrder` and the pool swap remain the final source of truth. A hint can become stale between simulation and mining; the transaction then reverts safely.

## How we deployed the contracts

### Canonical Uniswap v3 market

`Deploy.s.sol` uses the Monad Uniswap v3 factory, SwapRouter02, and WMON addresses:

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url monad \
  --broadcast \
  --private-key "$PRIVATE_KEY"
```

The script broadcasts one `new LimitOrderBook(factory, router, WMON)` transaction.

### Capricorn and PancakeSwap v3 markets

`DeployForkMarkets.s.sol` creates a dedicated `ForkRouter` and `LimitOrderBook` for each fork:

```text
Capricorn factory ──▶ ForkRouter ──▶ LimitOrderBook
Pancake factory   ──▶ ForkRouter ──▶ LimitOrderBook
```

```bash
forge script script/DeployForkMarkets.s.sol \
  --rpc-url monad \
  --broadcast \
  --private-key "$PRIVATE_KEY"
```

After deployment, addresses and deploy blocks are recorded in `packages/shared/src/addresses.ts`. The web app and keeper both import that same registry, preventing separate hard-coded production maps from drifting.

The ABI shipped to TypeScript is synchronized from the Foundry artifact with:

```bash
node scripts/sync-abi.mjs
```

Private keys remain only in the operator environment and are never part of the frontend bundle, documentation, or committed deployment output.

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

## Read the exact source

- [`LimitOrderBook.sol`](https://github.com/YUST777/MonTerminal/blob/main/contracts/src/LimitOrderBook.sol)
- [`ForkRouter.sol`](https://github.com/YUST777/MonTerminal/blob/main/contracts/src/ForkRouter.sol)
- [`PoolPriceLib.sol`](https://github.com/YUST777/MonTerminal/blob/main/contracts/src/libraries/PoolPriceLib.sol)
- [`LimitOrderBook.t.sol`](https://github.com/YUST777/MonTerminal/blob/main/contracts/test/LimitOrderBook.t.sol)
- [`ForkRouter.t.sol`](https://github.com/YUST777/MonTerminal/blob/main/contracts/test/ForkRouter.t.sol)
