# Onchain Proof

MonTerminal publishes two kinds of evidence:

1. **Live RPC evidence** — current chain ID, block, contract bytecode, counters, and recent events.
2. **Fixed transaction evidence** — immutable transaction hashes for completed order, swap, and bridge lifecycles.

## Live proof page

Open **[https://www.monterminal.fun/proof](https://www.monterminal.fun/proof)**.

The page reads Monad RPC through the production `/api/rpc` gateway and displays:

- network and chain ID;
- current block number;
- whether bytecode exists at each deployed order-book address;
- `nextOrderId()` for each book;
- the newest recent `OrderPlaced`, `OrderCancelled`, or `OrderExecuted` event;
- direct explorer links for completed mainnet proofs.

The values refresh automatically and can be refreshed manually.

## Deployed order books

| DEX | LimitOrderBook | Deploy block | Current proof state |
|---|---|---:|---|
| Uniswap v3 | [`0x595368DffF28eC08718Ca620EC9a981772628425`](https://monadscan.com/address/0x595368DffF28eC08718Ca620EC9a981772628425) | `88,077,155` | Bytecode deployed |
| Capricorn | [`0x07E94F44c89b648a36c7cd5408b52D76880857f7`](https://monadscan.com/address/0x07E94F44c89b648a36c7cd5408b52D76880857f7) | `88,086,521` | Bytecode deployed; four placed orders |
| PancakeSwap v3 | [`0x1672DB600D0c0213b3971F30438482Ea2Afaf53F`](https://monadscan.com/address/0x1672DB600D0c0213b3971F30438482Ea2Afaf53F) | `88,086,528` | Bytecode deployed |

## Interpreting `nextOrderId()`

The counter starts at `1` and increments after every successful placement.

```text
placed order count = nextOrderId - 1
```

The Capricorn book now returns `5`, which means four orders were successfully placed. Orders #1 and #3 were cancelled; orders #2 and #4 were executed.

## Direct RPC check

Anyone can reproduce the chain-ID check through the production gateway:

```bash
curl -sS https://www.monterminal.fun/api/rpc \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected result:

```json
{"jsonrpc":"2.0","id":1,"result":"0x8f"}
```

`0x8f` is decimal `143`, Monad Mainnet.

## Why fixed transaction links matter

A live UI could fail later because an RPC or indexer is temporarily unavailable. Transaction hashes remain independent evidence that the contract path executed successfully at least once.

See [Limit Orders](/limit-orders#real-lifecycle-proof) and [Swap & Bridge](/swap-and-bridge#real-same-chain-swap) for the published transactions.
