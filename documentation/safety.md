# Safety

::: danger Unaudited software
MonTerminal was built for a hackathon and has not received a professional security audit. Use only amounts you can afford to lose.
:::

## Before signing

Verify all of the following in the wallet:

- network and chain ID;
- token contract;
- spender or transaction destination;
- approval amount;
- native value;
- estimated gas;
- minimum received and price impact.

## Token approvals

The UI requests exact approval for the current order amount. An allowance may remain after cancellation because cancellation changes order state, not ERC-20 allowance.

Users can revoke approval independently. Revoking approval makes affected open orders unfillable.

## Stop-loss limitations

A stop loss is not a guaranteed price. Execution can fail or produce no fill when:

- liquidity disappears;
- price moves through the range too quickly;
- no executor submits a transaction;
- RPC or network access is unavailable;
- the maker lacks balance or allowance;
- the slippage-protected swap reverts;
- the order has expired.

## Bridge limitations

Cross-chain actions add relayer, source-chain, destination-chain, and provider risk. Small routes can lose a large percentage to flat fees. Always inspect the destination amount and minimum received.

## Malicious tokens

Passing basic ERC-20 metadata checks does not prove a token is safe. Tokens can include transfer taxes, blacklists, pausing, supply controls, honeypot behavior, or other custom logic.

## Private keys

The web application never needs a private key or seed phrase. The keeper uses a private key only in its own operator environment. Never commit a real key to Git, expose it in client-side variables, or paste it into the website.

## Incident response

If a wallet request looks wrong:

1. reject it;
2. disconnect the site;
3. review recent approvals and transactions in an explorer;
4. revoke suspicious allowances;
5. move remaining assets only if wallet compromise is suspected.
