# Changelog

All notable changes to Sparge are documented here.

This project is pre-launch and experimental. Breaking changes are expected before stable release.

## [Unreleased]

### Added
- Consent-based Windows Observer updates through the official GitHub Releases feed, with scheduled checks, verified release metadata, explicit download/install actions, and updater regression coverage.
- Public-alpha documentation architecture with compact MkDocs navigation, consolidated protocol/developer/operator guides, a configuration reference, and a private internal documentation area.
- Deterministic full-chain replay CLI (`npm run replay`) and `npm run test:replay` coverage for read-only genesis-to-tip reconstruction, final state comparison, corruption detection, and restored-backup replay.
- Production-grade producer backup and restore CLI with versioned metadata, SHA-256 checksums, SQLite snapshotting, and restore audit verification.
- Disabled-by-default private Operator Dashboard for loopback-only producer monitoring.
- Caddy HTTPS production Compose setup with TLS, security headers, internal-only producer/observer ports, and reverse-proxy documentation.
- Dockerfile and Docker Compose support for producer/observer container runs with separate persistent volumes, non-root execution, health checks, and JSON stdout logging defaults.
- Stability smoke suite (`npm run test:stability`) for producer/observer continuity, sync, and mismatch checks.
- Recovery smoke suite (`npm run test:recovery`) with snapshot/restore validation.
- Economics anti-abuse smoke suite (`npm run test:economics`) for sybil/sponsor-cap/free-rider/holder-window scenarios.
- Runtime invariant checks and `npm run test:invariants` coverage for chain/state/storage/mempool health and fail-safe mining pause.
- Electron-based Windows Observer app packaging flow (`npm run dist:observer:win`).

### Changed
- Consolidated feature-per-file documentation into audience-oriented guides without changing protocol, APIs, deployment configuration, or runtime behavior.
- Storage backend defaults to SQLite with chain identity meta checks.
- Observer mode is read-only and validates synced blocks from producer API.
- Explorer split into dedicated pages for block, tx, and address views.

### Known Gaps
- Dedicated protocol correctness smoke coverage for signed transaction bursts and participant lifecycle scenarios is still missing; deterministic replay now covers historical reconstruction through the implemented block-apply path, but the previous `npm run test:protocol` script referenced a file that is not present in repository history.

### Breaking
- Address/public key canonical format updated:
  - `publicKeyHex` is raw Ed25519 public key bytes (32 bytes / 64 hex chars)
  - address is `spg_` + base58(sha256(pubKeyBytes)[0..20])
- Canonical tx signing payload updated to deterministic field order.
- `txid` now hashes canonical message bytes and excludes signature.
- Chain data reset required after protocol/storage format migration.

### Migration Notes
- Delete old chain state when upgrading across the breaking changes above.
- Rebuild local runtime dependencies when switching Node major versions.
- Do not commit installers/binaries to git; publish via GitHub Releases.
