# Keeper

The keeper is a Node 22 + viem process that watches every configured order-book deployment and attempts permissionless execution.

## Processing loop

1. Hydrate prior `OrderPlaced`, `OrderCancelled`, and `OrderExecuted` events from each deployment.
2. Subscribe to new order events.
3. Build the set of pools referenced by open orders.
4. Read current pool ticks through multicall.
5. Evaluate expiry and trigger conditions in deterministic code.
6. Simulate `executeOrder`.
7. Send the transaction when simulation succeeds and `DRY_RUN=false`.
8. Serialize nonces through a shared queue.

## Configuration

```dotenv
RPC_URLS=https://rpc.monad.xyz,https://rpc1.monad.xyz
PRIVATE_KEY=0x...
POLL_MS=1000
DRY_RUN=true
LOG_LEVEL=info
```

`DRY_RUN` defaults to `true`. A production operator must explicitly set `DRY_RUN=false` and fund the keeper wallet with enough MON for gas.

## Run

```bash
pnpm keeper
```

## Permissionless design

The keeper is not trusted by the contracts. Any address can call `executeOrder`, and every caller is subject to the same trigger, pool, expiry, maker balance, allowance, and output checks.

## Current production claim

<span class="status-limited">Not continuously verified</span>

The repository proves that the keeper implementation and evaluator tests exist. MonTerminal does **not** currently claim that a continuously hosted keeper is online because no public heartbeat/status endpoint is available.

The contracts remain executable by the maker or any third-party searcher even when the included keeper is offline.

## What a future heartbeat should expose

- keeper address;
- current balance;
- last heartbeat time;
- last scanned block;
- open orders watched;
- last simulation/execution result;
- deployment revision.
