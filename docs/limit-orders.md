# Limit Orders

MonTerminal's core capability is a wallet-backed onchain trigger executed through a deployed `LimitOrderBook`.

## Supported order intentions

### Buy the dip

Spend the quote token only when the pool can return at least the configured amount of the target token. The order becomes fillable when the output requirement is satisfiable.

### Take profit

Sell the held token only when the swap can return at least the target quote amount. The minimum output acts as the onchain trigger.

### Stop loss

Sell after the pool's time-weighted price crosses the stop threshold. The contract also computes an execution-time output floor with the configured maximum slippage.

### Ladders

Multiple validated orders can be submitted atomically through `placeOrders`, allowing partial exits at different price levels.

## Lifecycle

```text
Wallet balance + allowance
          │
          ├── approve exact amount
          │
          ├── placeOrders ──▶ Open
          │                     │
          │                     ├── cancelOrder(s) ──▶ Cancelled
          │                     │
          │                     └── executeOrder ────▶ Executed
          │                                           │
          └───────────────────────────────────────────┘
                                      proceeds go to maker
```

## No escrow at placement

The book records the order but does not custody the input tokens. Execution uses `transferFrom` against the maker's then-current balance and allowance.

An open order can therefore fail if:

- the maker spends or transfers the input token;
- the maker revokes or reduces allowance;
- the order expires;
- the trigger is not met;
- the pool becomes unavailable or too illiquid;
- the swap cannot satisfy the dynamic slippage floor.

## Exact approvals

The production UI requests the exact total amount required by the current order transaction. It does not silently request `maxUint256` approval.

Cancelling an order changes its onchain status. It does not automatically revoke a remaining token allowance; users can review or revoke allowances separately.

## Execution and keeper fee

Execution is permissionless. The repository's keeper, another searcher, or the maker can call `executeOrder`. The successful executor receives the maker-configured keeper fee; the swap output goes to the maker.

The public repository contains the keeper implementation. **A continuously hosted 24/7 keeper is not currently claimed** because no public heartbeat has been deployed.

## Real lifecycle proof

The Capricorn deployment's counter now returns `nextOrderId() = 5`, proving four successful placements.

### Buy-side lifecycle

<div class="proof-grid">
  <a class="proof-card" href="https://monadscan.com/tx/0xbdd61d4a6015c2bd0fd9e5fbfa96695fd6fc1800352fe6c8e62e83db96a367d1" target="_blank"><strong>OrderPlaced #1</strong><small>Deliberately unfillable WMON → CHOG order</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0x00aa718897662145a631cfbb068ba4c917fadc1554b9333923a4cb9f89c7b91f" target="_blank"><strong>OrderCancelled #1</strong><small>Real cancellation transaction</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0xcf4bfee4607aed19787d6797fd316d2eba0d71c957ab153a7319e846da63dbb1" target="_blank"><strong>OrderPlaced #2</strong><small>Executable 0.002 WMON → CHOG order</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0x02ae018bdbaa76a112be1b2cbcad0d2124f4531efd7cb7ac032c7aa05d009342" target="_blank"><strong>OrderExecuted #2</strong><small>Received approximately 0.039329 CHOG</small></a>
</div>

### Sell-side lifecycle

<div class="proof-grid">
  <a class="proof-card" href="https://monadscan.com/tx/0x8e082f52375b71b99d4205a84e29e8192a1d4af1fff31c4fbd8c8606f27ed9d4" target="_blank"><strong>OrderPlaced #3</strong><small>Deliberately unfillable CHOG → WMON order</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0xdc79cfb0391ce42c493cce5df7f62c359ca5db3230b8233a951d08c01c26a548" target="_blank"><strong>OrderCancelled #3</strong><small>Real sell-side cancellation</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0xd144d3da656a9ca85a00fd79749f45a23fb1404de713942f802e492a215f6c3d" target="_blank"><strong>OrderPlaced #4</strong><small>Executable CHOG → WMON order</small></a>
  <a class="proof-card" href="https://monadscan.com/tx/0x974a973f74773ee58ab7e5aa8fb06b545e4608b570db5b079d1bf0e27ba10f7a" target="_blank"><strong>OrderExecuted #4</strong><small>Output unwrapped and paid as native MON</small></a>
</div>
