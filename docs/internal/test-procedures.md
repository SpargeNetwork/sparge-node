# Internal Test Procedures

This maintainer document records release-evidence expectations. It is not part of public MkDocs navigation.

## Release baseline

```powershell
npm run test:stability
npm run test:recovery
npm run test:economics
npm run test:participant-maturation
npm run test:participant-ui-docs
npm run test:validation
npm run test:request-size
npm run test:rate-limits
npm run test:mempool
npm run test:invariants
npm run test:logging
npm run test:network
npm run test:operator-dashboard
npm run test:backup
npm run test:replay
```

Record command, exit code, final PASS line, OS, Node version, commit, and relevant safe artifact path.

## Stability suite

`npm run test:stability` runs `scripts/test-stability.ps1`. It checks clean producer startup, restart continuity, fresh observer synchronization, catch-up after downtime, genesis mismatch, and previous-hash mismatch. It writes `scripts/out/test-stability-<timestamp>.log` and exits nonzero on failure.

## Recovery suite

`npm run test:recovery` checks the legacy snapshot/restore path and restart continuity in isolated directories. Production backup and restore behavior is separately covered by `npm run test:backup`.

## Economics suite

`npm run test:economics` checks Sybil-style participant behavior, sponsor caps, free-rider rejection, holder average-window edges, and invariants after adversarial scenarios. It writes `scripts/out/test-economics-<timestamp>.log`.

`npm run test:participant-maturation` checks the 25%, 60%, and 100% stage boundaries, deterministic rounding and treasury conservation, unregister/re-register reset semantics, inactivity continuity, pre-activation compatibility, real block rewards, and full replay of a maturation-enabled chain.

`npm run test:participant-ui-docs` checks maturity presentation, paused inactive state, pre-activation copy, sponsorship aggregates, reclaim limitations, required wallet/address markup, and public sponsorship wording.

`npm run test:community-identity` checks OAuth state and session rotation, canonical wallet challenges, expiry and replay rejection, address/public-key binding, Ed25519 verification, one-to-one links, relinking, objective and manual role boundaries, idempotent role synchronization, unrelated-role preservation, private-by-default profiles, CSRF enforcement, token redaction, and wallet/Explorer/Observer UI contracts. Discord HTTP calls are mocked; the suite never uses production credentials.

## Replay suite

`npm run test:replay` covers genesis-only and multi-block replay, deterministic repetition, report safety, read-only source behavior, fixed-tip selection, restored-backup replay, and corruption detection for links, hashes, transaction/reward data, duplicates, roots, tip state, and unsupported versions.

## Known gap

There is no `npm run test:protocol` command. Its former `scripts/test-protocol-correctness.js` target is absent from the checkout, `origin/main`, and locally available history. Do not claim that replay or another suite replaces dedicated signed-transaction burst, nonce sequencing, participant active-window boundary, and register/unregister/heartbeat lifecycle coverage.
