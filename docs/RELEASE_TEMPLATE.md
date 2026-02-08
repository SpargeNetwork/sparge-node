# Release Notes Template (Public Alpha)

Use this template for GitHub Releases.

## Sparge `vX.Y.Z-alpha`

Date: `YYYY-MM-DD`  
Tag: `vX.Y.Z-alpha`

### Compatibility
- `protocolVersion`: `...`
- `economicsVersion`: `...`
- `chainId`: `...`

### Highlights
- ...
- ...

### Breaking Changes
- ...

### Migration Notes
1. Stop producer/observer processes.
2. Snapshot old data if needed.
3. Reset or migrate state as required by this release.
4. Start producer, then observer, and verify `/api/status`.

### Validation Evidence
- `npm run test:stability` -> PASS
- `npm run test:recovery` -> PASS
- `npm run test:protocol` -> PASS
- `npm run test:economics` -> PASS

### Artifacts
- Windows observer installer: `Sparge Observer Setup X.Y.Z.exe`
- Checksums:
  - `sha256: ...`

### Known Limitations (Alpha)
- Single producer architecture (no multi-producer consensus/finality yet)
- HTTP-based observer sync (no P2P gossip/discovery yet)
- Economic model still alpha-tested; parameters may change pre-stable
