# Production Status

Last documentation update: **July 18, 2026**.

## Current capability matrix

| Area | State | Notes |
|---|---|---|
| Discover | <span class="status-live">Live</span> | Real indexed Monad pools |
| Token deep links | <span class="status-live">Live</span> | SPA rewrites and contract checks enabled |
| Spot chart and statistics | <span class="status-live">Live</span> | GeckoTerminal plus Monad reads |
| AMM depth | <span class="status-live">Live</span> | Derived from concentrated-liquidity ticks |
| Market buy/sell | <span class="status-live">Live</span> | Wallet-signed live routes |
| Limit buy/sell | <span class="status-live">Live + proven</span> | Four real placements; two executions |
| Order cancellation | <span class="status-live">Live + proven</span> | Buy and sell cancellation receipts |
| Portfolio | <span class="status-live">Live</span> | Current balances plus real price data |
| Swap | <span class="status-live">Live + proven</span> | Real Monad MON → USDC swap |
| Bridge | <span class="status-live">Live + proven</span> | Real Monad → Base fill |
| Live Proof | <span class="status-live">Live</span> | Direct RPC reads and explorer links |
| AI planner | <span class="status-disabled">Disabled</span> | No production model provider key |
| Keeper service | <span class="status-limited">Code only</span> | Not presented as continuously online |
| Launchpad | <span class="status-disabled">Coming soon</span> | No launch flow is presented as working |
| Rewards | <span class="status-disabled">Coming soon</span> | No reward accrual is presented as working |

## Production smoke test

The repository includes:

```bash
pnpm smoke:production
```

It verifies:

- frontend availability;
- SPA deep links;
- Monad chain ID through `/api/rpc`;
- live GeckoTerminal pools;
- portfolio history response;
- truthful capability flags.

## Troubleshooting

### “Monad RPC is temporarily unavailable”

The token may still be valid. Retry the request. If the gateway is down, contract detection, balances, pools, and orders cannot be read safely.

### “Token found, but no supported liquidity pool”

The contract passed ERC-20 checks, but MonTerminal could not resolve a supported pool. Do not interpret this as “invalid token.”

### “Amount too small” in Swap · Bridge

Relay rejected the route because the output cannot cover route costs or its minimum size. Increase the amount only after reviewing the resulting fees.

### AI planner unavailable

This is expected while the production environment has no model provider key. Manual order construction remains available and uses deterministic code.

### Open order cannot execute

Check maker balance, allowance, expiry, pool liquidity, trigger condition, and slippage. Open status alone does not guarantee future fill.
