# Operator Guide

This is the single operational source of truth for a Sparge producer. It covers deployment, Docker, HTTPS, logging, monitoring, backup, replay, recovery, upgrades, and incident handling. Protocol and API behavior are documented separately and are not changed by these procedures.

## Introduction

The public-alpha topology has one official producer and any number of read-only observers. The producer is operationally critical: protect its data directory, keep administrative routes private, monitor health and observer agreement, and maintain verified off-site backups.

Before operating a public node:

- use a dedicated host or isolated runtime account
- keep `dev.enableAdmin` disabled
- keep the Operator Dashboard disabled unless accessing it through a private administrative channel
- expose only Caddy on ports 80 and 443
- retain exact chain identity and recovery configuration
- establish an incident owner, operator, and communications owner

## Local producer

Start the producer and explorer:

```powershell
npm start
```

The source default data directory is `server/data`; override it with an absolute `DATA_DIR`. The directory contains `state.db`, `genesis.json`, logs, observer-registry data within SQLite, and safe operational status files. Do not share it with another node process.

For isolated local testing only, enable administrative mining endpoints before startup:

```powershell
$env:DEV_ENABLE_ADMIN="true"
npm start
```

Then use `npm run mine:start`, `npm run mine:status`, and `npm run mine:stop`. These controls are not production APIs.

## Deployment

For internet-facing operation, use `docker-compose.production.yml` with Caddy as the only public service. Keep the producer and observer application ports on the internal Docker network. Use exact CORS origins and one trusted proxy hop.

A public deployment needs:

- a real DNS hostname with `A` and/or `AAAA` records pointing to the host
- inbound TCP ports 80 and 443
- durable storage for producer, observer, and Caddy volumes
- sufficient disk space for chain growth, logs, and backup staging
- an off-host backup destination

Set `SPARGE_DOMAIN=explorer.example.com`, then follow [HTTPS and Caddy](#https-and-caddy).

## Docker

The image uses `node:20-bookworm-slim`, installs production dependencies with `npm ci --omit=dev`, runs `node server/index.js`, and executes as the non-root `node` user.

### Local Compose

The development Compose file publishes both application ports:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

- Producer: `http://localhost:3051`
- Observer: `http://localhost:3052`

The observer reaches its producer at `http://producer:3051`; `localhost` inside the observer container refers to the observer itself.

The services use separate named volumes:

- `sparge-producer-data`
- `sparge-observer-data`

`docker compose down` preserves volumes. `docker compose down -v` destroys both chain data volumes and must be treated as a destructive reset.

### Container security

The supplied Compose setup uses a non-root process, read-only root filesystem, writable `/app/data`, `/tmp` tmpfs, no privileged or host-network mode, no Docker socket, no broad host mount, `no-new-privileges`, and dropped Linux capabilities.

Runtime state lives under `/app/data`, not in the image. With bind mounts, make the host directory writable by the container user. Never bake keys into the image or put them in Compose files.

### Health and shutdown

`scripts/docker-healthcheck.js` queries `http://127.0.0.1:$PORT/api/status`. Producer liveness requires reachable API and non-failing chain/storage health. Observer liveness rejects fatal invariant/storage failures and `syncState: "error"`, but allows ordinary synchronization lag.

Stop gracefully:

```powershell
docker compose stop
```

Compose sends `SIGTERM`; the node stops sync and heartbeat loops, closes HTTP, and allows SQLite writes to finish. The grace period is 30 seconds.

## HTTPS and Caddy

Production traffic flows as follows:

```text
Internet -> Caddy :80/:443 -> producer:3051 on the internal network
                                ^
                                observer syncs internally
```

Start the production stack:

```powershell
$env:SPARGE_DOMAIN="explorer.example.com"
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
```

Caddy automatically obtains certificates for a publicly reachable hostname and stores ACME state in `caddy-data`. It redirects HTTP to HTTPS and sets one-year HSTS without `includeSubDomains` or `preload`.

The production environment sets exact same-origin CORS, JSON logging, and `SECURITY_TRUST_PROXY=1`. This tells Express to trust exactly one Caddy hop. Do not use broad `trustProxy: true`, and do not expose the producer directly alongside the trusted-proxy setting.

### Public hardening

Caddy applies:

- a 32 KB global request-body cap
- 5-second upstream dial timeout
- 15-second response-header timeout
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive camera, microphone, and geolocation permissions
- Content Security Policy
- removal of the `Server` header

Application route-specific body limits and endpoint rate limits remain authoritative.

Caddy blocks `/operator`, `/operator/*`, `/api/operator/*`, state-changing mining routes, and `/api/debug/*`. This is defense in depth; application guards must remain enabled.

### Verification

```powershell
Invoke-RestMethod https://$env:SPARGE_DOMAIN/api/status
curl -I http://$env:SPARGE_DOMAIN/
curl -I https://$env:SPARGE_DOMAIN/
```

Confirm HTTP redirects to HTTPS, security headers are present, `/api/status` includes `X-Request-ID`, application ports are not public, and body/rate-limit errors remain `413`, `415`, and `429` as applicable.

Certificate failure usually indicates incorrect DNS, closed ports, or lack of public reachability. An upstream failure indicates producer health or Docker-network problems. If rate limits see only the proxy address, verify the one-hop setting and forwarding-header overwrite. If CSP blocks assets, inspect browser diagnostics and confirm assets are same-origin.

## Logging

Producer and observer use one structured logger. Logs are observability data only and cannot affect consensus or validation.

Source nodes write `<DATA_DIR>/logs/sparge-node.log` when file logging is enabled. Rotation starts at `logging.maxFileSizeBytes` and retains `logging.maxFiles` numbered archives. Container defaults use JSON stdout with file logging disabled:

```text
LOG_FORMAT=json
LOG_CONSOLE_ENABLED=true
LOG_FILE_ENABLED=false
```

Follow logs with:

```powershell
docker compose logs -f producer
docker compose logs -f observer
docker compose -f docker-compose.production.yml logs -f caddy
```

Caddy access logs are separate JSON stdout records. Authorization, Cookie, and Set-Cookie headers are removed. Request bodies are not logged, but query strings are normal access-log data and must not carry secrets.

### Correlation and events

Every API request has an `X-Request-ID`. Validation, size, rate, admission, and unexpected errors share that ID in logs.

Common structured events include:

- `node_starting`, `node_started`, `node_shutdown`
- `http_request_completed`, `request_failed`
- `validation_failed`, `request_size_rejected`, `rate_limit_triggered`
- `transaction_accepted`, `transaction_rejected`
- `block_mined`, `block_validation_failed`
- `producer_mining_started`, `producer_mining_stopped`, `producer_mining_paused`
- `observer_sync_started`, `observer_sync_progress`, `observer_sync_completed`, `observer_sync_failed`
- `observer_heartbeat_received`
- `invariant_check_passed`, `invariant_check_failed`
- mempool rejection events

Mining events contain only aggregate metadata such as height, hash prefix, transaction count, duration, remaining mempool count, and invariant state.

Redaction excludes private keys, seeds, mnemonics, passwords, secrets, tokens, signatures, raw transactions and bodies, host/user/machine names, raw IP addresses, and full internal observer IDs. Security-event logs are throttled to avoid floods.

The Windows desktop observer separately rotates `%APPDATA%\SpargeObserver\logs\node.log`; `OBSERVER_LOG_MAX_BYTES` defaults to 10 MiB and `OBSERVER_LOG_MAX_FILES` defaults to 7.

## Monitoring

Poll `GET /api/status` and `GET /api/network/status`. The included local watchdog can monitor an observer:

```powershell
npm run ops:healthwatch
```

Custom invocation:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/watch-health.ps1 `
  -BaseUrl http://127.0.0.1:3052 `
  -MaxLagBlocks 8 `
  -MaxConsecutiveFailures 3
```

It emits `ALERT` after repeated failures and writes `scripts/out/health-watch-<timestamp>.log`.

Monitor observer counts, mismatches, highest and lowest heights, average lag, last block age, block timing, and pending transactions. Define an uptime target and an external notification path before public launch; the repository does not supply a hosted alerting backend.

### Mempool health

Track `mempoolTransactionCount`, `mempoolBytes`, `mempoolMaxTransactions`, `mempoolMaxBytes`, and `mempoolUtilizationPercent`. Warn at 80% and treat 95% as critical. Inspect traffic before raising limits because larger bounds increase worst-case memory. A restart clears pending transactions.

### Runtime invariants

Track:

- `healthy`, `chainHealthy`, `storageHealthy`, `mempoolHealthy`
- `invariantStatus`
- `lastFastInvariantHeight`, `lastFullAuditHeight`
- `lastInvariantCheckAt`, `lastInvariantFailureCode`
- `miningPausedForSafety`

Fast checks run before block commit; full audits inspect stored chain, current state, SQLite, and mempool accounting. If mining pauses for safety, keep it stopped, preserve the current database and logs, and investigate before repair or restore.

## Operator Dashboard

The private read-only dashboard is separate from the explorer and disabled unless explicitly enabled. Secure configuration is:

```yaml
operatorDashboard:
  enabled: false
  bindLocalOnly: true
```

For temporary local access:

```powershell
$env:OPERATOR_DASHBOARD_ENABLED="true"
$env:OPERATOR_DASHBOARD_LOCAL_ONLY="true"
npm start
```

Open `http://127.0.0.1:3051/operator`. Access it locally, through an SSH tunnel, or through a controlled VPN terminating locally. Never publish it to `0.0.0.0` on an internet-facing host. Production Caddy blocks both the page and API.

The dashboard reports node/version/uptime, height and block timing, mempool usage, invariants and storage health, SQLite size/integrity, observer aggregates, request/validation/rate/size metrics, process memory, recent safe event summaries, and last backup time/height/age.

It does not expose paths, keys, secrets, raw node IDs, hostnames, bodies, signatures, raw logs, backup paths, replay reports, or mismatch details. Actions are read-only: opening Explorer, copying diagnostics, and a future diagnostics-bundle placeholder. There are no mining, reset, wipe, or validation-bypass controls.

Future work includes authenticated sessions, downloadable diagnostics, configurable alert thresholds, longer history, and external metrics export.

## Backups

Producer backups are versioned ZIP archives sufficient to recover after hardware failure, migration, deletion, or rollback.

Create and verify:

```powershell
npm run backup
npm run backup:verify -- backups/<backup>.zip
```

Custom output:

```powershell
npm run backup -- --data-dir server/data --out-dir backups
```

### Archive format

Each archive contains:

- `data/state.db`
- `data/genesis.json`
- `config/config.yml`
- `backup.json`

`backup.json` records `backupVersion`, creation time, software and chain versions, chain ID, genesis hash, height, latest block hash, state root, SQLite version, and each file's relative path, byte size, and SHA-256 checksum.

The SQLite backup API creates a consistent snapshot without copying WAL/SHM files. Creation copies genesis and active recovery configuration, computes checksums, stages the ZIP atomically, reopens it, verifies metadata and checksums, and records privacy-safe dashboard status. Mining need not pause for SQLite snapshot mode, although a cautious operator may stop it briefly.

Recommended public-alpha policy:

- daily automated backup at minimum
- backup before every deploy or identity/economics/configuration migration
- retain several generations
- store at least one encrypted off-site copy
- regularly restore and replay a copy, not merely check that an archive exists

Backups contain full public chain state but no wallet private keys.

### Docker backup

Conservative offline flow:

```powershell
docker compose stop producer
docker run --rm -v sparge-producer-data:/data -v ${PWD}/backups:/backups sparge-node:local npm run backup -- --data-dir /data --out-dir /backups
docker compose start producer
```

The same helper can create an online SQLite snapshot while the producer runs. Restore must never run against an active producer.

## Restore

Restore into an empty directory:

```powershell
npm run restore -- backups/<backup>.zip --target server/data-restored
```

An existing target is refused. `--force` explicitly deletes the target first and is destructive:

```powershell
npm run restore -- backups/<backup>.zip --target server/data --force
```

Restore validates the ZIP central directory and required entries, checks every SHA-256, verifies genesis identity, stages all files in a temporary directory, runs SQLite integrity through startup invariants, verifies latest height/hash/state root, and only then moves the complete staged directory into place. Any failure aborts without partial target data.

For Docker, stop the producer and run the restore helper against its volume, then start only after verification:

```powershell
docker compose stop producer
docker run --rm -v sparge-producer-data:/data -v ${PWD}/backups:/backups sparge-node:local npm run restore -- /backups/<backup>.zip --target /data --force
docker compose start producer
```

The older `npm run snapshot:state` and `npm run restore:state` scripts create a simpler state/genesis snapshot. They remain useful for local smoke tests, but versioned backup plus verification and replay is the production recovery path.

## Deterministic replay

Replay opens source SQLite read-only, pins a target height/hash at startup, reconstructs state from genesis in an isolated temporary directory using the production observer block-apply path, and compares the rebuilt tip with persisted canonical state.

```powershell
npm run replay -- --data-dir server/data --report replay-report.json --progress-every 1000
```

It verifies genesis identity, versions, block order/linkage/hash/header fields, transaction count and duplicate transaction IDs, production state transitions and reward checks, each state root, and final ledger/meta/tip equality.

Diagnostic modes:

```powershell
npm run replay -- --from-height 0 --to-height 10000
npm run replay -- --verify-tip-only
```

A historical target is labeled `partial` because canonical ledger snapshots are not stored for every old height. Tip-only mode checks SQLite integrity, latest metadata/block consistency, and current state root without historical replay.

Replay is not formal verification, a consensus/finality proof, cryptographic audit, or independent security audit. It cannot enforce rules absent from the production block-apply path. The current block format has no separate producer-signature field to verify.

Reports contain safe timing, identity, range/count, expected/replayed hash and root, memory, duration, success, and failure-code fields. They omit filesystem paths, keys, transaction dumps, bodies, and signatures. Failure codes are:

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

Replay stops at the first mismatch and includes the failing height when available.

Recommended verification flow:

```powershell
npm run backup
npm run backup:verify -- <backup.zip>
npm run restore -- <backup.zip> --target server/data-replay-check
npm run replay -- --data-dir server/data-replay-check --report replay-report.json
```

Replay may be expensive and loads the selected block range for a fixed-tip snapshot. Use progress reporting and run against a restored copy for routine backup certification.

## Recovery

### Disaster recovery

1. Stop the failed or old producer and preserve available evidence.
2. Provision a replacement host with the intended software version.
3. Copy a known backup to the host.
4. Run `npm run backup:verify -- <backup.zip>`.
5. Restore to an empty data directory.
6. Replay the restored copy and require matching tip hash and state root.
7. Start the producer without mining.
8. Verify chain ID, genesis hash, height/hash, storage health, and invariant status.
9. Start observers and confirm agreement and synchronization.
10. Resume mining only after health is clean.

### Replay failure

Stop mining, back up the suspect state for evidence, save the replay report and failure height/code, verify the latest known-good archive, restore it to a temporary directory, and replay it. Replace producer data only after both archive verification and full replay pass.

### Observer divergence

An observer can be rebuilt from the producer because it is read-only. Preserve its database and logs when investigating, then reset only that observer's data directory and resynchronize. Never reset producer data merely to repair one observer.

## Upgrades

1. Read the changelog and identify protocol, economics, storage, and migration changes.
2. Record current version, chain ID, genesis hash, height, hash, and health.
3. Create, verify, restore-test, and replay a producer backup.
4. Build or pull the new image.
5. Stop services gracefully.
6. Start the new software with the same intended volumes/configuration.
7. Verify HTTPS, status identity, height continuity, startup audit, mempool health, and observer sync.
8. Keep mining stopped if any identity or invariant check fails.
9. Roll back software and use the verified backup only according to the release migration plan.

For production Compose, include `sparge-producer-data`, `sparge-observer-data`, `caddy-data`, and `caddy-config` in host-migration planning.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Producer restarts at genesis | Stop it and verify `DATA_DIR`, volume attachment, and preserved `genesis.json`/`state.db`; do not continue mining. |
| Startup identity audit fails | Compare configuration, genesis hash, protocol/economics versions, and backup metadata. |
| Mining paused for safety | Preserve state/logs and investigate `lastInvariantFailureCode`; do not force mining. |
| Mempool stays above 80% | Inspect traffic and sender distribution; avoid raising limits without memory analysis. |
| Observer shows genesis mismatch | Confirm intended producer, preserve evidence, and resync only the observer. |
| Caddy cannot issue TLS | Verify public DNS, ports 80/443, and host reachability. |
| Caddy returns upstream errors | Check producer health and internal Docker networking. |
| Rate limits use proxy address | Verify exactly one trusted hop and that the producer is not directly exposed. |
| Restore refuses target | Use an empty directory; use `--force` only after explicit destructive confirmation. |
| Replay reports mismatch | Freeze mining, preserve evidence, and validate a known-good restored backup. |

## Incident and rollback playbook

Trigger conditions include repeated observer errors, invariant failure, unexplained height/hash divergence, storage integrity failure, or a release that cannot pass startup audit.

1. Incident owner declares a freeze and selects the recovery target.
2. Operator stops mining and, if necessary, transaction intake.
3. Preserve database, status output, relevant logs, heights, hashes, and replay report.
4. Communications owner announces scope and impact without exposing sensitive diagnostics.
5. Verify and replay the selected backup in isolation.
6. Stop all producer/observer processes before replacing producer data.
7. Start producer without mining; verify identity and invariants.
8. Start observers and confirm they converge.
9. Resume traffic and mining only with incident-owner approval.
10. Publish the rollback height/hash/time and residual risk.

## Best practices

- Keep public and administrative network paths separate.
- Leave admin/debug routes disabled and dashboard loopback-only.
- Use exact CORS origins and minimal proxy trust.
- Monitor health externally rather than relying only on the dashboard.
- Keep multiple verified off-site backup generations.
- Practice restore and replay before an incident.
- Never delete or regenerate genesis to solve an identity mismatch.
- Never share a data directory between nodes.
- Treat configuration and data migration as release-controlled changes.
- Preserve evidence before reset, rollback, or repair.

## Operational test commands

Before a public-alpha release or risky upgrade, run:

```powershell
npm run test:stability
npm run test:recovery
npm run test:economics
npm run test:validation
npm run test:request-size
npm run test:rate-limits
npm run test:mempool
npm run test:invariants
npm run test:logging
npm run test:network
npm run test:operator-dashboard
npm run test:community-identity
npm run test:backup
npm run test:replay
```

The dedicated `test:protocol` suite is currently missing. Release evidence must state that gap explicitly rather than treating another suite as a fake replacement.
