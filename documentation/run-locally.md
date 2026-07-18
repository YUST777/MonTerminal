# Run Locally

## Requirements

- Node.js 22
- pnpm 11
- Foundry for contract tests
- a Monad RPC endpoint

## Install

```bash
git clone https://github.com/YUST777/MonTerminal.git
cd MonTerminal
pnpm install --frozen-lockfile
```

## Web application

Create a root `.env` or export an RPC value:

```dotenv
RPC_URLS=https://rpc.monad.xyz,https://rpc1.monad.xyz
```

Then run:

```bash
pnpm web
```

Open the Vite URL printed in the terminal.

## Documentation

```bash
pnpm --dir documentation dev
```

The documentation source lives in `documentation/`. VitePress builds it with a `/docs/` public base path.

## Tests

```bash
pnpm test
```

This runs shared order-math tests, keeper evaluator tests, and web gateway tests.

## Contracts

```bash
cd contracts
MONAD_RPC_URL=https://rpc.monad.xyz forge test -vv
```

The suite forks Monad Mainnet and requires working RPC access.

## Production build

```bash
pnpm build
```

The web build first generates the static VitePress site into `web/public/docs`, then type-checks and builds the Vite application.

## Production smoke test

```bash
pnpm smoke:production
```

The script targets `https://www.monterminal.fun` unless configured otherwise.

## Keeper

Copy `.env.example` to `.env`, add a dedicated funded keeper key, keep `DRY_RUN=true` during initial testing, then run:

```bash
pnpm keeper
```

Never use a high-value personal wallet as a keeper key.
