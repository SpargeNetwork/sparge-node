# Independent Review Packet (Public Alpha)

## Purpose
Independent review of tx validation + state transitions for Public Alpha.

Goal: give an external reviewer a focused, <60 minute path to identify high-risk correctness/security issues.

## Out of Scope
- Network consensus/fork-choice/finality design
- Economics philosophy/tokenomics strategy
- UI/UX polish and styling quality
- Desktop packaging/installer behavior

## Review Targets (in order)

### A) Transaction validation and canonical rules
- `server/lib/tx.js`
  - canonical message fields/order
  - deterministic txid
  - signature verification behavior
- `server/routes/rpc.js`
  - `POST /api/tx` validation path
  - tx `type` handling
  - memo length limits
  - nonce checks
  - fee checks
  - chainId checks
  - observer read-only gate

### B) State transition application
- `server/lib/blockchain.js`
  - tx application flow
  - reward application flow
  - stateRoot computation
  - deterministic ordering expectations
- storage/ledger wiring used by block apply
  - balance, nonce, participant updates
  - no partial or skipped state effects

### C) Participation and bond rules
- `server/lib/participants.js`
- `server/routes/rpc.js` (register/unregister/heartbeat validation)
- `server/lib/blockchain.js` (register/unregister/heartbeat apply)
  - bond lock/unlock
  - sponsor cap behavior
  - active window/liveness determinism

### D) Storage correctness guarantees
- `server/storage/sqliteStorage.js`
  - atomic write transaction across block + indexes + state
  - crash consistency assumptions
- meta identity checks
  - `chainId`
  - `genesisHash`
  - `protocolVersion`
  - `economicsVersion`

## Reviewer Checklist (answer each)
- Are all state-changing routes properly gated in observer mode?
- Can a tx bypass signature/nonce/fee checks?
- Is there any path that can create funds unexpectedly (mint outside reward logic)?
- Are reward splits conserved exactly per block (sum equals mint; remainder deterministic)?
- Are nonces strictly monotonic and enforced consistently between mempool and block apply?
- Are participant bond and liveness rules deterministic and non-abusable?
- Does SQLite write path prevent partial state on crash (single transaction)?
- Any obvious DoS vectors in /api/blocks and /api/tx (limits/rate)?

## Evidence Run Commands
Run from repo root:

```powershell
npm run test:stability
npm run test:recovery
npm run test:protocol
```

Expected:
- all commands exit with code `0`
- each command reports final `RESULT: PASS`

Attach command output and log file references in `docs/REVIEW_EVIDENCE_TEMPLATE.md`.

## Findings Severity Rubric
- `Critical`: allows theft/mint, breaks determinism, chain halt, remote write bypass
- `High`: censorship/DoS with trivial effort, inconsistent state across nodes
- `Medium`: edge-case correctness bug, poor error handling
- `Low`: style, minor UX, non-security refactors

## Reporting
Use: `docs/REVIEW_EVIDENCE_TEMPLATE.md`

Minimum evidence:
- reviewer identity + date + commit hash/tag
- environment details
- command outputs for all three smoke tests
- findings table (or explicit no-critical sign-off)
