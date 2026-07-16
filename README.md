# MonoLimit

**Non-custodial stop-losses, take-profits and sell ladders on Monad mainnet.**

You buy a meme coin and want to sleep. MonoLimit gives you GMGN-style automation, fully on-chain: *"sell everything if I'm down 50%"*, *"at 2× sell half, let the rest ride"* — with no deposits, no custody, and permissionless execution.

Built for the buildanything.so **Spark** Monad hackathon. 100% original code.

## How it works

```
┌──────────┐  approve + placeOrders   ┌──────────────────┐
│  Trader   │ ───────────────────────▶ │  LimitOrderBook   │  immutable, no owner
│ (web UI)  │        cancel ▲          │   (on-chain)      │  no escrow — tokens stay
└──────────┘                          └────────┬─────────┘  in your wallet
                                                │ executeOrder (anyone)
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                         keeper bot       MEV searchers      you, manually
                              └── caller earns the keeper fee ────┘
                                                │
                                     Uniswap v3 exactInputSingle
                                     proceeds → maker (native MON)
```

Three pieces, one pnpm monorepo:

| Package | What |
|---|---|
| [`contracts/`](contracts/) | Foundry — `LimitOrderBook.sol` + mainnet-fork test suite (27 tests) |
| [`keeper/`](keeper/) | Node 22 + viem bot — polls every 1s, simulates, executes when profitable |
| [`web/`](web/) | Vite + React 19 + Tailwind v4 dark trading terminal (chart, ladders, order dock) |
| [`packages/shared/`](packages/shared/) | Chain def, addresses, ABI, tick/price math — unit-tested, used by web **and** keeper |

## Security design: how triggers are proven

The interesting problem: how does an on-chain order book know the price crossed your trigger, without a trusted oracle, and without being manipulable?

**Take-profit — the market is the proof.** `minAmountOut` *is* the trigger. The swap simply reverts unless the pool pays at least your target quote. There is no price read at all — manipulation (pump/sandwich) can only *improve* your fill, never hurt it.

**Stop-loss — 60s TWAP, two ways.**
1. *Firing*: the contract reads the pool's 60-second TWAP tick via `observe()` and requires it past your trigger. A flash-loan dump moves spot, not the TWAP — the order won't fire inside the same block (fork-tested).
2. *Filling*: at execution the contract computes a **dynamic floor** — `quoteAtTick(twapTick) × (1 − maxSlippageBps)` — and swaps with `amountOutMinimum = max(dynamicFloor, order.minAmountOut)`. A keeper (or searcher) sandwiching your exit gets the whole tx reverted.

`placeOrders` calls `increaseObservationCardinalityNext(180)` on stop-loss pools so the TWAP window is always available; a fresh pool reverts `TwapUnavailable()` and the keeper backs off and retries.

**Ladders** ("sell 50% at 2×, 25% at 5×") are N independent orders placed atomically in one `placeOrders([...])` tx — O(1) execution each, individually cancellable, no partial-fill accounting.

Other properties:
- **Immutable** — no owner, no pause, no upgrade path.
- **Approval-based custody** — tokens are pulled only at the moment your trigger fires; the book holds zero balance between transactions (fuzz + invariant tested).
- **Permissionless execution** — anyone may call `executeOrder` and earn the keeper fee (10–100 bps, default 30). MEV searchers are free backup keepers.
- Reentrancy-guarded, CEI, balance-delta accounting (fee-on-transfer safe), native-MON payout with non-griefable WMON fallback.

## Addresses (Monad mainnet, chainId 143)

| Contract | Address |
|---|---|
| LimitOrderBook | [`0x595368DffF28eC08718Ca620EC9a981772628425`](https://monadscan.com/address/0x595368DffF28eC08718Ca620EC9a981772628425) (deploy block 88077155, Sourcify-verified) |
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| Uniswap v3 Factory | `0x204FAca1764B154221e35c0d20aBb3c525710498` |
| SwapRouter02 | `0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900` |

## Running it

```sh
pnpm install

# contracts — fork tests against pinned Monad mainnet block
cd contracts && MONAD_RPC_URL=https://rpc.monad.xyz forge test

# shared math + keeper evaluator unit tests
pnpm test

# keeper (reads ../.env: RPC_URLS, PRIVATE_KEY, BOOK_ADDRESS, DEPLOY_BLOCK, DRY_RUN)
pnpm keeper

# web terminal
pnpm web
```

`.env` is never committed — see `.env.example`.

### Deploy

```sh
cd contracts
forge script script/Deploy.s.sol --rpc-url monad --broadcast --private-key $PRIVATE_KEY
node ../scripts/sync-abi.mjs   # refresh shared ABI after any contract change
```

## Data sources (all real, no mocks)

- **Candles** — GeckoTerminal public API (`networks/monad` OHLCV), 15s refresh
- **Live price** — on-chain `slot0` every 3s (the same source the contract's TWAP derives from)
- **Orders** — contract events + `getOrders` multicall; no external indexer
- **Buy / bridge-in** — [Relay](https://relay.link) (instant MON→token market buys; cross-chain bridge to Monad)
