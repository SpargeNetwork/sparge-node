# Deterministic Replay

Deterministic replay reconstructs Sparge chain state from genesis to a pinned tip and compares the rebuilt state with persisted canonical SQLite state.

It does not change consensus, block format, transaction format, economics, wallet behavior, observer behavior, public APIs, or persisted canonical state.

## What It Verifies

Full replay verifies:
- `genesis.json` identity and configured chain/protocol/economics versions
- stored genesis block identity and state root
- strict block height order
- previous hash linkage
- block hash recomputation from the stored header
- header fields matching block fields
- duplicate committed transaction IDs
- producer/observer external block validation through `applyExternalBlock`
- user transaction application as implemented by the production block-apply path
- mint, reward, treasury, node-pool, holder-pool, and participant distribution checks as implemented by the production block-apply path
- base fee transition checks as implemented by the production block-apply path
- stored block `stateRoot` after each replayed block
- final ledger, nonces, stakes, participants, balance history, selected metadata, latest height, latest hash, and latest state root

Replay reuses production observer validation and state transition logic. It is not a separate simplified protocol implementation.

## What It Does Not Prove

Replay is not:
- formal verification
- a consensus safety proof
- a cryptographic audit
- an external security audit
- a fork-choice/finality test

If the current production block-apply path lacks a protocol rule, replay does not invent that rule. For example, block producer signatures are not checked unless they exist in the current block format.

## Commands

Full replay against the default producer data:

```powershell
npm run replay
```

Custom data dir:

```powershell
npm run replay -- --data-dir server/data
```

Write a safe JSON report:

```powershell
npm run replay -- --data-dir server/data --report replay-report.json
```

Progress every 1000 blocks:

```powershell
npm run replay -- --progress-every 1000
```

Diagnostic replay to a historical height:

```powershell
npm run replay -- --from-height 0 --to-height 10000
```

Partial replay is labeled `mode: "partial"` and must not be described as full-chain verification because historical canonical state snapshots are not stored for every height.

Fast tip-only check:

```powershell
npm run replay -- --verify-tip-only
```

Tip-only mode checks SQLite integrity, latest meta/block consistency, and current persisted state root. It does not replay historical blocks.

## Fixed-Tip Behavior

Replay opens `state.db` read-only and pins the target block height/hash at startup. Blocks mined after the replay starts do not change the selected replay target.

Direct live replay is read-only, but the recommended public-alpha workflow is to replay a restored backup:

1. Create backup.
2. Verify backup.
3. Restore backup into a temporary directory.
4. Run full replay against the restored directory.
5. Confirm tip hash and state root match.
6. Mark the backup as fully verified.

## Backup Workflow

```powershell
npm run backup
npm run backup:verify -- <backup.zip>
npm run restore -- <backup.zip> --target server/data-replay-check
npm run replay -- --data-dir server/data-replay-check --report replay-report.json
```

Do not restore over an active producer data directory. Restore refuses non-empty targets unless `--force` is supplied.

## Report

The report contains:
- `replayVersion`
- `mode`
- `startedAt`
- `completedAt`
- `chainId`
- `genesisHash`
- `fromHeight`
- `toHeight`
- `blocksVerified`
- `transactionsVerified`
- `expectedTipHash`
- `replayedTipHash`
- `expectedStateRoot`
- `replayedStateRoot`
- `success`
- `durationMs`
- `memory`
- safe `error` details on failure

Reports do not include local filesystem paths, private keys, complete transaction dumps, request bodies, or raw signatures.

## Failure Codes

Common replay failure codes:
- `REPLAY_GENESIS_MISMATCH`
- `REPLAY_HEIGHT_GAP`
- `REPLAY_PREVIOUS_HASH_MISMATCH`
- `REPLAY_BLOCK_HASH_MISMATCH`
- `REPLAY_TXID_MISMATCH`
- `REPLAY_REWARD_MISMATCH`
- `REPLAY_STATE_ROOT_MISMATCH`
- `REPLAY_TIP_STATE_MISMATCH`
- `REPLAY_UNSUPPORTED_VERSION`
- `REPLAY_STORAGE_ERROR`

Failures stop at the first mismatch by default and report the failing height where available.

## Performance

Replay may be expensive because it rebuilds state from genesis in an isolated temporary SQLite directory. Use `--progress-every <N>` for large chains.

The process cleans its temporary replay directory after success or failure and does not write into active `DATA_DIR` unless you explicitly choose a report path inside that directory.

## Tests

```powershell
npm run test:replay
```

The test suite covers valid genesis-only and multi-block chains, deterministic repeated replay, report safety, read-only source behavior, fixed target behavior, restored-backup replay, and corruptions for previous hash, block hash, transaction/reward data, duplicate transactions, state roots, tip state, and unsupported versions.

## Recovery Procedure

If replay fails on production data:
1. Stop mining.
2. Create a backup of the current data for evidence.
3. Save the replay report.
4. Note the failure code and height.
5. Run `npm run backup:verify` on the latest known-good backup.
6. Restore the known-good backup into a temporary directory.
7. Run full replay against that restored directory.
8. Only restore into the producer `DATA_DIR` after backup verification and replay both pass.

