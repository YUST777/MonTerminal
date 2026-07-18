# Architecture

MonTerminal is a pnpm monorepo containing Solidity contracts, shared order math and addresses, a keeper, a Vite/React web application, Vercel API functions, and this static documentation site.

## System map

```text
                        ┌──────────────────────┐
                        │  GeckoTerminal       │
                        │  DexScreener / Relay │
                        └──────────┬───────────┘
                                   │ live market/route data
┌──────────────┐   HTTPS   ┌───────▼──────────┐     JSON-RPC     ┌──────────────┐
│ Browser UI   ├──────────▶│ Vercel gateways  ├────────────────▶│ Monad RPC    │
│ React + Vite │           │ /api/*           │                 │ chain ID 143 │
└──────┬───────┘           └──────────────────┘                 └──────┬───────┘
       │ wallet signatures                                                │
       │                                                                  │ reads/writes
       ▼                                                                  ▼
┌──────────────┐                                                  ┌──────────────────┐
│ User wallet  ├─────────────────────────────────────────────────▶│ LimitOrderBooks  │
└──────────────┘       approve / place / cancel                  └────────┬─────────┘
                                                                          │ execute
                                   ┌──────────────────┐                   ▼
                                   │ Keeper/searcher  ├──────────▶ DEX pools/routers
                                   └──────────────────┘
```

## Repository packages

| Path | Responsibility |
|---|---|
| `contracts/` | Foundry contracts, deployment scripts, and Monad-fork tests |
| `packages/shared/` | Chain config, deployed addresses, ABI, order math, shared types |
| `keeper/` | Event hydration, pool watching, trigger evaluation, simulation, execution |
| `web/` | React/Vite product UI and Vercel serverless functions |
| `documentation/` | VitePress user, technical, and verification documentation |
| `scripts/` | Production smoke and ABI synchronization scripts |

## Trust boundaries

### Browser

Builds deterministic order parameters, reads public data, and asks the connected wallet to sign. It cannot access a wallet private key.

### Vercel gateways

Proxy public RPC and market-data requests. They do not sign onchain transactions. The AI endpoint may call a configured model provider, but the output is schema-validated and converted into deterministic contract parameters in the client.

### Wallet

Owns signing authority. Approval, placement, cancellation, market swaps, and Relay actions require wallet authorization.

### Contracts

Store order state and enforce execution conditions. The deployed order books are immutable and have no application owner capable of moving arbitrary user funds.

### Keeper

Has its own gas wallet and can call permissionless execution. It cannot bypass maker balance, allowance, trigger, expiry, pool, or slippage checks enforced by the contract.
