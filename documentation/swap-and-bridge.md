# Swap & Bridge

The same widget supports two route types through Relay:

- **Swap** — origin and destination chain are the same.
- **Bridge** — origin and destination chains differ.

## Quote lifecycle

1. Select origin chain/token and destination chain/token.
2. Enter the exact input amount.
3. MonTerminal requests Relay `quote/v2` with the connected wallet as user, recipient, and refund address.
4. The UI shows estimated output, minimum received, provider fee, swap impact, and estimated time.
5. Quotes older than approximately 30 seconds are refreshed before execution.
6. The wallet switches to the origin chain and signs each required transaction or supported signature step.
7. MonTerminal polls Relay's status endpoint until fill, failure, or refund state is known.

## Safety checks

The interface checks:

- token balance;
- origin-chain native gas balance;
- stale quotes;
- minimum received;
- high price impact;
- user-rejected chain switches or signatures;
- unsupported or too-small routes.

Relay can reject dust amounts. “No route” or “Amount too small” is a real provider response, not a mocked application failure.

## Real same-chain swap

On July 18, 2026, the proof wallet executed:

- Input: `5 MON`
- Destination: Monad Mainnet
- Received: `0.107470 USDC`
- Transaction: [MonadScan](https://monadscan.com/tx/0x1189f0d7a0367702642187a025ef1e77c2f08a8966adcff1d63f0eae16cac12a)

## Real cross-chain bridge

On July 18, 2026, the proof wallet executed:

- Input: `2 MON` on Monad
- Destination: Base
- Received: `0.020909 USDC` on Base
- Source transaction: [MonadScan](https://monadscan.com/tx/0x81b0581ab9f4be8f29f355405c3acd87dec59a644bab11b0bb4ddea05328cb8f)
- Destination fill: [BaseScan](https://basescan.org/tx/0x060162ace868faaae38625b3e28e86daab380cf5a8686c71eb43a19d602cd33d)

::: warning Dust bridges can be inefficient
The real 2 MON bridge had roughly 51% total impact because flat relayer/execution costs dominated the small dollar value. Always review fees and minimum received. A technically valid route is not automatically an economically good route.
:::
