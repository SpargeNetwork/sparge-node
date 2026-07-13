# Backups and Restore

Sparge producer backups are versioned ZIP archives containing enough state to recover a producer after hardware failure, VPS migration, accidental deletion, or rollback.

This system does not change chain protocol, consensus, transaction serialization, economics, observer validation, or wallet behavior.

## Commands

Create a backup:

```powershell
npm run backup
```

Custom paths:

```powershell
npm run backup -- --data-dir server/data --out-dir backups
```

Verify an archive:

```powershell
npm run backup:verify -- backups/sparge-backup-....zip
```

Full replay verification after restore:

```powershell
npm run replay -- --data-dir server/data-restored --report replay-report.json
```

Restore to an empty data directory:

```powershell
npm run restore -- backups/sparge-backup-....zip --target server/data-restored
```

Restore over an existing directory only with explicit confirmation:

```powershell
npm run restore -- backups/sparge-backup-....zip --target server/data --force
```

`--force` deletes the target data directory first. Treat it as destructive.

## Backup Format

Archive entries:
- `data/state.db`
- `data/genesis.json`
- `config/config.yml`
- `backup.json`

`state.db` is created using SQLite's backup API, so the archive contains a consistent database snapshot without needing WAL/SHM files.

`backup.json` contains:
- `backupVersion`
- `createdAt`
- `softwareVersion`
- `chainId`
- `protocolVersion`
- `economicsVersion`
- `genesisHash`
- `blockHeight`
- `latestBlockHash`
- `stateRoot`
- `sqliteVersion`
- `files[]` with path, byte size, and SHA-256

## Creation Verification

Backup creation:
1. Opens the producer SQLite DB read-only.
2. Creates a consistent SQLite snapshot.
3. Copies `genesis.json`.
4. Copies the active recovery config.
5. Builds `backup.json`.
6. Computes SHA-256 checksums.
7. Writes the ZIP archive atomically through a staging directory.
8. Re-reads the archive and verifies metadata/checksums.
9. Writes safe local backup status for the Operator Dashboard.

Mining does not need to be paused for SQLite snapshot mode. For maximum operational caution, you may still stop mining briefly before backup.

For public-alpha backups, treat `backup:verify` plus deterministic replay of a restored copy as the strongest local verification workflow. Replay is intentionally separate from backup creation so backup checksums and restore checks cannot be weakened by replay behavior.

## Restore Verification

Restore:
1. Refuses non-empty target directories unless `--force` is supplied.
2. Reads and validates the ZIP central directory.
3. Verifies required files.
4. Verifies SHA-256 checksums.
5. Verifies `genesisHash`.
6. Restores into a temporary staging directory first.
7. Runs SQLite `integrity_check` through the startup invariant path.
8. Verifies latest height, latest block hash, and state root.
9. Moves the staged restore into place only after all checks pass.

If any step fails, restore aborts and does not partially restore into the target directory.

## Docker Workflow

Conservative offline backup:

```powershell
docker compose stop producer
docker run --rm -v sparge-producer-data:/data -v ${PWD}/backups:/backups sparge-node:local npm run backup -- --data-dir /data --out-dir /backups
docker compose start producer
```

Online backup is supported because SQLite snapshot mode is consistent:

```powershell
docker run --rm -v sparge-producer-data:/data -v ${PWD}/backups:/backups sparge-node:local npm run backup -- --data-dir /data --out-dir /backups
```

Restore into a producer volume only after stopping the producer:

```powershell
docker compose stop producer
docker run --rm -v sparge-producer-data:/data -v ${PWD}/backups:/backups sparge-node:local npm run restore -- /backups/<backup>.zip --target /data --force
docker compose start producer
```

Do not run restore while the producer is active.

## Recommended Schedule

For public-alpha:
- backup before every deploy
- backup before every config/protocol/economics change
- at least daily automated backups
- retain multiple generations
- store at least one copy off-site

Keep backups encrypted at rest if they are stored on third-party infrastructure. The archive does not contain private wallet keys, but it does contain full chain state.

## Disaster Recovery Checklist

1. Stop the failed or old producer.
2. Provision replacement host.
3. Install the same or intended rollback software version.
4. Copy the backup archive to the host.
5. Verify:
   ```powershell
   npm run backup:verify -- <backup.zip>
   ```
6. Restore to an empty `DATA_DIR`.
7. Run deterministic replay before using the restored data:
   ```powershell
   npm run replay -- --data-dir <restored-data-dir> --report replay-report.json
   ```
8. Start the producer.
9. Verify `/api/status`:
   - `chainId`
   - `genesisHash`
   - `latestHeight`
   - `latestHash`
   - `invariantStatus`
10. Start observers and confirm sync.
11. Resume mining only after health is clean.

## Operator Dashboard

The private Operator Dashboard displays:
- last backup time
- last backup height
- backup age

It does not expose backup file paths.
