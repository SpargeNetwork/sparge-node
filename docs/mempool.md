# Bounded Mempool

The producer mempool is in-memory and bounded to reduce RAM exhaustion risk.

## Configuration

Configure in `config/config.yml`:

```yaml
mempool:
  sort: fee
  maxTransactions: 10000
  maxBytes: 52428800
  maxTransactionsPerSender: 100
  transactionTtlSeconds: 3600
  maxFutureNonceGap: 100
  minimumFeeMicro: "0"
```

Startup validates these values. Count, byte, per-sender, TTL, and future nonce values must be positive safe integers. `minimumFeeMicro` must be a non-negative integer string.

`minimumFeeMicro` does not introduce a new transaction fee rule. The transaction route still enforces the existing protocol `tx.minFeeMicro` / gas minimum fee rule.

## Architecture

The mempool stores transactions in:

- `Map(txid -> transaction)` for duplicate detection and removal
- insertion-order array for deterministic listing/removal
- sender count map for per-sender limits
- tracked total byte count
- cumulative rejection/expiry counters

All removals go through one helper so transaction count, byte count, sender counts, and insertion order stay in sync.

## Byte Accounting

Mempool bytes use a deterministic stable JSON serialization of the normalized transaction fields. This is not a JavaScript object memory estimate.

The byte count is updated on:

- insertion
- mining/removal
- expiry
- failed admission rollback

`recomputeAccounting()` can rebuild and verify accounting for tests/debugging.

## Admission Flow

The producer keeps the existing request-size, rate-limit, schema, signature, sender, balance, participant, fee, and nonce checks.

After the sender is safely established, admission checks:

1. duplicate pending txid
2. duplicate confirmed txid
3. excessive future nonce
4. per-transaction byte size
5. per-sender pending count
6. global transaction count
7. global byte capacity
8. insertion and index updates

Duplicate attempts do not change counters.

## Nonce Behavior

Nonce gaps are not currently allowed. The accepted nonce must be the confirmed account nonce or the next sequential pending nonce.

`maxFutureNonceGap` only adds an explicit `NONCE_TOO_FAR_AHEAD` rejection for absurdly far future nonces. It does not enable nonce gaps or out-of-order execution.

## TTL

Each transaction stores an internal `admittedAt` timestamp. Expiry does not rely on client-provided transaction timestamps.

Expired transactions are removed opportunistically during:

- admission
- mempool reads
- nonce/spend checks
- block selection

Default TTL is one hour.

## Full Pool Behavior

This implementation uses deterministic reject-on-full behavior. It does not evict existing transactions by fee.

Responses:

- `MEMPOOL_FULL`, HTTP `503`
- `MEMPOOL_SENDER_LIMIT`, HTTP `429`
- `NONCE_TOO_FAR_AHEAD`, HTTP `400`
- `MEMPOOL_DUPLICATE`, HTTP `409`

Fee-based eviction is intentionally not enabled yet because safe eviction must account for nonce chains.

## Metrics

`/api/status` and `/api/mempool` expose aggregate metrics:

- `mempoolTransactionCount`
- `mempoolBytes`
- `mempoolMaxTransactions`
- `mempoolMaxBytes`
- `mempoolUtilizationPercent`
- `expiredTransactionsRemoved`
- `rejectedMempoolFull`
- `rejectedSenderLimit`
- `rejectedDuplicate`
- `rejectedOversizedTransaction`

Raw sender distribution and internal indexes are not exposed.

`/api/mempool` still returns the pending transaction list for compatibility. This is useful for local explorer/debugging, but public deployments should treat full pending transaction visibility as a privacy consideration because it includes public transaction fields such as memo and signature.

## Restart Behavior

The mempool is not durable:

- producer restart clears pending transactions
- counters reset on restart
- users may need to resubmit transactions that were pending before restart

This task does not add durable mempool persistence.

## Operations

Suggested alert thresholds:

- warn at `80%` utilization
- critical at `95%` utilization

Raise limits only after checking available RAM and expected transaction size. Excessively large limits increase worst-case memory pressure and can delay cleanup/scans.

For future production scale-out, durable/shared mempool design or upstream edge limiting may be needed. This implementation is process-local.
