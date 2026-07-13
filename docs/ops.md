# Ops / Runbook

## Producer Run

- Start node + explorer: `npm start`
- Start block production: `npm run mine:start`
- Stop block production: `npm run mine:stop`
- Mining status: `npm run mine:status`

## Observer Run (source)

In `config/config.yml`:
- `node.mode: observer`
- `node.producerUrl: "http://localhost:3051"`

Start observer:
- `npm start`

## Observer Run (Windows app)

- Build installer: `npm run dist:observer:win`
- Install: `release/Sparge Observer Setup 0.1.0.exe`
- Data/log path: `%APPDATA%\\SpargeObserver\\`

## Reset Data

Producer local reset script:
- `powershell scripts/reset-chain.ps1`

Observer app reset (desktop app):
- remove `%APPDATA%\\SpargeObserver\\data`
- optionally remove `%APPDATA%\\SpargeObserver\\config.json`

## Data Directory Paths

Producer (source run):
- default: `server/data`
- override: set `DATA_DIR=<absolute-path>`

Observer (source run):
- default follows `DATA_DIR`; if unset, `server/data`

Observer desktop app:
- `%APPDATA%\\SpargeObserver\\data`
- `%APPDATA%\\SpargeObserver\\logs`
- `%APPDATA%\\SpargeObserver\\config.json`

## Health Monitoring

Run watchdog:
- `npm run ops:healthwatch`

Direct invocation with custom thresholds:
- `powershell -ExecutionPolicy Bypass -File scripts/watch-health.ps1 -BaseUrl http://127.0.0.1:3052 -MaxLagBlocks 8 -MaxConsecutiveFailures 3`

Behavior:
- polls `/api/status` on interval
- marks observer unhealthy when `syncState=error` or `lagBlocks` exceeds threshold
- emits an explicit `ALERT` line after consecutive failures
- writes output to `scripts/out/health-watch-<timestamp>.log`

## Log Retention Policy

Observer runtime log path:
- `%APPDATA%\\SpargeObserver\\logs\\node.log`

Automatic rotation/retention in launcher:
- rotates when `node.log` exceeds max size
- keeps latest N log files (`node.log` + archived `node-*.log`)

Env overrides:
- `OBSERVER_LOG_MAX_BYTES` (default: `10485760`, 10 MiB)
- `OBSERVER_LOG_MAX_FILES` (default: `7`)

## Core Config

Main config file:
- `config/config.yml`

Important keys:
- `node.mode` (`producer` or `observer`)
- `node.producerUrl`
- `chain.*`, `token.*`, `rewards.*`, `tx.*`
- `mempool.*` for transaction pool capacity, TTL, and per-sender limits
- `invariants.*` for runtime chain/state/storage/mempool checks and fail-safe mining pause

## Mempool Monitoring

Monitor `/api/status`:

- `mempoolTransactionCount`
- `mempoolBytes`
- `mempoolMaxTransactions`
- `mempoolMaxBytes`
- `mempoolUtilizationPercent`

Suggested thresholds:

- warn at `80%`
- critical at `95%`

If utilization is consistently high, inspect traffic patterns before raising limits. Larger limits increase worst-case RAM usage. Producer restart clears the in-memory mempool, so pending transactions may need to be resubmitted.

## Invariant Monitoring

Monitor `/api/status`:

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

If `miningPausedForSafety` is `true`, keep mining stopped until the failed invariant is understood. Snapshot the current state before any manual repair.

## Release Notes

Do not commit build artifacts:
- `release/`
- `build/`
- `electron/runtime/`

Release sources:
- changelog: `CHANGELOG.md`
- release notes template: `docs/RELEASE_TEMPLATE.md`

## Release Runbook (Alpha)

1. Ensure clean working tree:
   - `git status`
2. Run validation suite:
   - `npm run test:stability`
   - `npm run test:recovery`
   - `npm run test:economics`
   - `npm run test:invariants`
3. Build observer installer:
   - `npm run dist:observer:win`
4. Create/refresh release notes from `docs/RELEASE_TEMPLATE.md`.
5. Tag release:
   - `git tag vX.Y.Z-alpha`
   - `git push origin vX.Y.Z-alpha`
6. Publish installer via GitHub Releases (do not commit binaries).

## Snapshot & Restore (SQLite)

Create snapshot zip (state + genesis):
- `npm run snapshot:state`

Direct snapshot with custom paths:
- `powershell -ExecutionPolicy Bypass -File scripts/snapshot-state.ps1 -DataDir <path> -OutDir <path>`

Restore snapshot to a target data directory:
- `powershell -ExecutionPolicy Bypass -File scripts/restore-state.ps1 -SnapshotZip <zipPath> -TargetDataDir <path> -Force`

Notes:
- stop node processes before snapshot/restore
- snapshot artifacts are written to `snapshots/` by default
- restore requires `state.db` and `genesis.json`

## Replay / Bootstrap Procedure

Bootstrap a fresh machine/node:
1. Copy snapshot zip to host.
2. Restore into a clean data dir via `scripts/restore-state.ps1`.
3. Start node with `DATA_DIR` pointing to restored dir.
4. Verify with `/api/status`:
   - `genesisHash` matches expected
   - `latestHeight` is not regressed
5. For observer nodes, set `NODE_MODE=observer` + `PRODUCER_URL`, then verify `syncState`.

Automated local recovery smoke test:
- `npm run test:recovery`
- validates snapshot -> restore -> restart continuity in isolated dirs

## Stability Smoke Tests

Run the full stability baseline suite:
- `npm run test:stability`

Direct script invocation:
- `powershell -ExecutionPolicy Bypass -File scripts/test-stability.ps1`

What it verifies:
- producer cold start from clean data dir
- producer restart continuity (genesis + height monotonic)
- observer fresh sync (0 -> tip)
- observer catch-up after producer downtime
- mismatch handling (`genesisHash` mismatch and `prevHash` mismatch)

Output:
- PASS/FAIL lines in terminal
- log file: `scripts/out/test-stability-<timestamp>.log`
- exit code `0` on success, `1` on any failure

## Protocol Correctness Coverage

The previous `npm run test:protocol` script referenced `scripts/test-protocol-correctness.js`, but that file is not present in this checkout, `origin/main`, or repository history available locally.

Current related coverage:
- `npm run test:stability` covers producer/observer continuity, sync, and mismatch handling.
- `npm run test:recovery` covers snapshot/restore continuity.
- `npm run test:economics` covers sybil/sponsor-cap/free-rider/holder-window scenarios and checks invariants after adversarial economics scenarios.
- `npm run test:mempool` covers bounded mempool accounting, TTL, sender limits, duplicate handling, and removal behavior.
- `npm run test:invariants` covers runtime chain/state/storage/mempool invariant checks and fail-safe mining pause behavior.

Still missing as a dedicated smoke suite:
- nonce monotonic behavior and mempool sequencing under real tx burst
- reward accounting consistency as a protocol-focused suite
- participant active-window boundary and register/unregister/heartbeat lifecycle as one protocol correctness run

## Economics Anti-Abuse Smoke Test

Run:
- `npm run test:economics`

What it validates:
- sybil-style participant registration and reward split behavior
- sponsor cap enforcement (`MAX_SPONSORED_PARTICIPANTS`)
- free-rider rejection for unfunded/unregistered participants
- holder average-window edge behavior near eligibility threshold
- invariants remain green after adversarial economics scenarios

Output:
- PASS/FAIL lines in terminal
- log file: `scripts/out/test-economics-<timestamp>.log`
- exit code `0` on success, `1` on any failure

## Incident / Rollback Playbook (v1)

Roles:
- Incident owner: decides Go/No-Go and freeze/resume.
- Operator: executes stop/snapshot/restore actions.
- Comms owner: posts public status updates.

Trigger examples:
- repeated `syncState=error` on observer fleet
- invariants failures
- unexplained height/hash divergence

Immediate actions:
1. Freeze producer activity (stop mining and tx intake if needed).
2. Snapshot current producer data (`npm run snapshot:state`).
3. Capture evidence: `/api/status`, recent logs, affected heights/hashes.
4. Decide rollback target snapshot and confirm expected `genesisHash`.

Rollback execution:
1. Stop all producer/observer processes.
2. Restore selected snapshot into producer `DATA_DIR`.
3. Start producer and validate `/api/status`.
4. Start observers and confirm `syncState=synced`.
5. Resume mining/traffic only after validation.

Communication checklist:
- announce incident start (impact + scope)
- announce rollback point (height/hash/time)
- announce service restored + residual risks
