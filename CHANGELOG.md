# Changelog

All notable changes to Sparge are documented here.

This project is pre-launch and experimental. Breaking changes are expected before stable release.

## [Unreleased]

### Added
- Stability smoke suite (`npm run test:stability`) for producer/observer continuity, sync, and mismatch checks.
- Recovery smoke suite (`npm run test:recovery`) with snapshot/restore validation.
- Protocol correctness smoke suite (`npm run test:protocol`) for invariants, nonce sequencing, reward accounting, and participant lifecycle checks.
- Economics anti-abuse smoke suite (`npm run test:economics`) for sybil/sponsor-cap/free-rider/holder-window scenarios.
- Electron-based Windows Observer app packaging flow (`npm run dist:observer:win`).

### Changed
- Storage backend defaults to SQLite with chain identity meta checks.
- Observer mode is read-only and validates synced blocks from producer API.
- Explorer split into dedicated pages for block, tx, and address views.

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
