# Getting Started

This guide takes a user from an unopened wallet to a verified trade or order.

## 1. Open the real application

Use **[https://www.monterminal.fun/](https://www.monterminal.fun/)**. The production hostname redirects to the canonical `www` domain.

## 2. Connect a wallet

Select **Connect Wallet** in the top-right corner. MonTerminal supports injected EVM wallets. The app asks the wallet to switch networks when an action must execute on a different chain.

For Spot trading and limit orders, use:

| Setting | Value |
|---|---|
| Network | Monad Mainnet |
| Chain ID | `143` |
| Native currency | `MON` |
| Explorer | [MonadScan](https://monadscan.com/) |

## 3. Choose a market

From **Discover**, select a real indexed pool. You may also open a token directly:

```text
https://www.monterminal.fun/token/monad/<token-address>
```

MonTerminal checks contract bytecode and ERC-20 metadata before treating the address as a token. It then resolves and verifies supported liquidity pools.

The interface distinguishes between:

- no contract at the address;
- a contract that is not a standard ERC-20;
- a valid token with no supported pool;
- a temporary RPC or provider failure.

## 4. Pick an action

| Goal | Where |
|---|---|
| Buy or sell immediately | Spot → Buy/Sell |
| Buy after a price drop | Spot → Limit → Buy |
| Stop a loss | Spot → Limit → Sell below market |
| Take profit | Spot → Limit → Sell above market |
| Create a ladder | Spot → AI, when configured, or multiple manual orders |
| Swap on one chain | Swap · Bridge → select same chain |
| Bridge to another chain | Swap · Bridge → select different chains |
| Inspect holdings | Portfolio |
| Verify production | Live Proof |

## 5. Review wallet requests

Limit orders use **exact-amount approval**. A typical flow is:

1. Approve only the order's required input amount.
2. Wait for the approval receipt.
3. Sign `placeOrders`.
4. Verify the transaction on MonadScan.

Never sign solely because a button says “Approve.” Check the token, spender, amount, chain, and contract address in the wallet.

## 6. Confirm the result

- Market swaps should show the received asset in the wallet.
- Limit orders should appear in **Open Orders** after confirmation.
- Cancelled and executed orders move into order history.
- Bridge routes should show both the Monad source transaction and destination fill.

If anything looks wrong, stop and use the [troubleshooting section](/production-status#troubleshooting).
