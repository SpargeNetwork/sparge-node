# Independent Review Packet

## Purpose

Give an external reviewer a focused path to identify high-risk correctness and security issues in transaction validation and state transitions for public alpha.

Out of scope are consensus/fork-choice design not implemented by the project, economics philosophy, UI polish, and desktop packaging.

## Review targets

1. `server/lib/tx.js`: canonical fields/order, deterministic transaction ID, signature verification.
2. `server/routes/rpc.js`: schema, observer write gate, chain ID, signer, signature, type fields, fee, balance, nonce, duplicate, and mempool checks.
3. `server/lib/blockchain.js`: transaction/reward application, state-root calculation, deterministic ordering.
4. `server/lib/participants.js`: bonds, sponsor caps, liveness, registration and unregister behavior.
5. `server/storage/sqliteStorage.js`: atomic block/index/state/meta writes and crash assumptions.
6. Storage identity checks: chain ID, genesis hash, protocol version, economics version.

## Reviewer questions

- Can an observer or public route bypass state-changing gates?
- Can a transaction bypass signature, nonce, fee, chain, or balance checks?
- Can funds be minted outside deterministic reward logic?
- Are reward shares conserved, including remainders?
- Are nonces consistent between admission and block application?
- Are participant bond, sponsor, and liveness rules deterministic?
- Is each SQLite block transition atomic?
- Are block feeds and transaction routes bounded against trivial denial of service?

## Evidence

Run all commands in `docs/internal/test-procedures.md`. Require exit code zero and an explicit PASS result. State clearly that the dedicated protocol correctness suite remains missing unless actually restored.

Severity rubric:

- Critical: theft/mint, determinism break, chain halt, remote write bypass
- High: low-cost censorship/denial of service, divergent node state
- Medium: edge-case correctness or material error-handling defect
- Low: minor risk, style, or non-security issue

Record results in `docs/internal/review-evidence-template.md`.
