# Release Notes Template (Public Alpha)

Use this internal template to prepare a GitHub Release.

## Sparge `vX.Y.Z-alpha`

Date: `YYYY-MM-DD`
Tag: `vX.Y.Z-alpha`

### Compatibility

- `chainId`:
- `protocolVersion`:
- `economicsVersion`:
- data migration/reset required:

### Highlights

- ...

### Breaking changes and migration

1. Stop producer and observer processes.
2. Create, verify, restore-test, and replay a backup.
3. Apply the documented migration or reset.
4. Start producer without mining and verify identity/audit.
5. Start observers and verify synchronization.
6. Resume mining only after health is clean.

### Validation evidence

- Commit and environment:
- `npm run test:stability`:
- `npm run test:recovery`:
- `npm run test:economics`:
- `npm run test:invariants`:
- `npm run test:replay`:
- remaining suites from `docs/internal/test-procedures.md`:
- dedicated protocol suite: MISSING unless restored in this release

### Artifacts

- Windows observer installer:
- SHA-256 checksums:

### Known limitations

- Single official producer; no multi-producer consensus/finality.
- HTTP observer synchronization; no P2P discovery/gossip.
- Economics and parameters remain alpha and may change before stability.
- Additional release-specific limitations:
