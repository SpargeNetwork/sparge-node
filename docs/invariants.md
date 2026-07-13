# Runtime Invariants

Sparge runs local runtime invariant checks to detect impossible chain, storage, state, and mempool conditions before they silently spread.

These checks do not replace transaction validation, block validation, sync validation, or consensus rules. They are a safety layer around the existing producer and observer logic.

## Configuration

Configure invariant behavior in `config/config.yml`:

```yaml
invariants:
  enabled: true
  fastChecksEveryBlock: true
  fullAuditOnStartup: true
  fullAuditIntervalBlocks: 0
  stopMiningOnFailure: true
```

- `enabled`: turns runtime invariant checks on or off.
- `fastChecksEveryBlock`: checks each locally produced or externally synced block before it is accepted.
- `fullAuditOnStartup`: runs a full audit when the node starts.
- `fullAuditIntervalBlocks`: runs a full audit every N produced blocks. `0` disables interval audits.
- `stopMiningOnFailure`: pauses producer mining when an invariant fails.

Do not disable these checks on a public producer unless you are isolating a known recovery operation.

## Fast Checks

Fast checks run on a candidate block before producer storage commit and before observer block commit. They validate:

- height continuity
- chain ID, genesis hash, protocol version, and economics version
- previous block hash
- block hash recomputation from the stored header
- transaction count
- supported committed transaction types
- candidate state root against candidate ledger state
- non-negative balances and nonces
- supply counters within safe bounds
- participant record shape
- mempool accounting consistency

If a producer fast check fails, the candidate ledger/meta mutation is discarded and mining is paused when `stopMiningOnFailure` is enabled.

If an observer fast check fails, the external block is rejected before `putBlock`.

## Full Audit

Full audit checks the stored chain and current state:

- block height sequence
- duplicate block heights and hashes
- duplicate confirmed transaction IDs
- block hash/header consistency
- monotonic block timestamps
- latest state root versus current ledger
- meta latest height/hash versus latest block
- SQLite integrity check when the SQLite backend is active
- mempool accounting consistency

The audit is intentionally bounded to current runtime data. It does not yet replay every historical state transition from genesis.

## Status Fields

`GET /api/status` includes:

- `healthy`
- `chainHealthy`
- `storageHealthy`
- `mempoolHealthy`
- `invariantStatus`
- `lastFastInvariantHeight`
- `lastFullAuditHeight`
- `lastInvariantCheckAt`
- `lastInvariantFailureCode`
- `miningPausedForSafety`

`miningPausedForSafety: true` means the producer refused to continue mining after an invariant failure.

## Debug Endpoint

The existing local/debug-only invariant endpoint still delegates to the full audit:

```text
GET /api/debug/invariants
```

It is only available through the existing debug/local guard.

## Logging

Invariant failures are logged as structured events with:

- failure code
- source
- height
- category
- protocol version
- economics version
- mining pause state

Logs are throttled to avoid flooding during repeated failures.

## Known Coverage Gap

`npm run test:invariants` covers runtime invariant checks and safety pause behavior.

The older `npm run test:protocol` command is still intentionally absent because `scripts/test-protocol-correctness.js` is not present in this checkout or local repository history. Dedicated historical replay/protocol correctness coverage remains a separate gap.
