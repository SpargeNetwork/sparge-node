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

## Core Config

Main config file:
- `config/config.yml`

Important keys:
- `node.mode` (`producer` or `observer`)
- `node.producerUrl`
- `chain.*`, `token.*`, `rewards.*`, `tx.*`

## Release Notes

Do not commit build artifacts:
- `release/`
- `build/`
- `electron/runtime/`

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
