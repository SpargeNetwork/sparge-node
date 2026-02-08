# Sparge Public Alpha Launch Checklist

Scope: public alpha only (single producer + observer architecture).

Use this as a Go/No-Go gate before inviting external users.

## 1) Security Baseline
- [x] Public config sets `dev.enableAdmin=false`.
- [x] No admin/debug shortcuts exposed on internet-facing nodes.
- [x] Rate limiting enabled for `/api/*` (especially `/api/tx`).
- [x] Request size limits enabled for JSON endpoints.
- [x] CORS policy is explicit (no wildcard in production).
- [x] Observer mode rejects state-changing routes (`POST /tx` etc.).
- [x] `/api/blocks` sync endpoint rate-limited or protected against unbounded range requests.

## 2) Stability Baseline
- [x] Producer cold start works from clean data directory.
- [x] Producer restart keeps chain continuity (no silent reset).
- [x] Observer fresh sync from height 0 to tip is verified.
- [x] Observer reconnect/catch-up works after producer downtime.
- [x] Divergence handling tested (`genesisHash` mismatch and `prevHash` mismatch).

## 3) Data Safety & Recovery
- [x] Snapshot process for SQLite state is documented.
- [x] Restore process is tested on a separate machine.
- [x] Replay/bootstrap procedure is documented.
- [x] Data directory locations are documented for producer and observer.
- [x] Rollback/incident playbook exists (who decides, how to communicate, how to recover).

## 4) Protocol Correctness Confidence
- [x] Invariants endpoint/checks pass over recent chain range.
- [x] Nonce sequencing/mempool inclusion behavior tested under load.
- [x] Reward accounting validated against expected split sums.
- [x] Participant active-window behavior tested near boundaries.
- [x] Bond lock/release flows tested (register/unregister/heartbeat).
- Review guide: `docs/REVIEW_PACKET.md`
- [x] Independent reviewer has inspected tx validation + state transition code paths.

## 5) Anti-Abuse Economics (Alpha Gate)
- [x] Sybil-style participation scenarios simulated.
- [x] Holder eligibility edge timing tested around payout window.
- [x] Sponsor cap constraints tested under adversarial sequences.
- [x] No obvious free-rider path found for reward capture.
- [x] Known economic limitations are explicitly documented.

## 6) Release Discipline
- [ ] Version tag created (`v0.x.y-alpha`).
- [ ] Changelog includes breaking changes + migration notes.
- [ ] `protocolVersion` and `economicsVersion` declared in release notes.
- [ ] Build instructions are reproducible from a clean machine.
- [ ] Installer/EXE artifacts are published via GitHub Releases (not committed to repo).

## 7) Observability & Operations
- [ ] Health check endpoint monitored.
- [ ] Log files rotate or have retention policy.
- [ ] Critical errors trigger alert/notification path.
- [ ] Basic uptime target defined for producer and public observer.
- [ ] Incident response contacts/responsibilities are defined.

## 8) User-Facing Clarity
- [ ] README starts with: experimental, no guarantees, not an investment.
- [ ] Current architecture is clearly stated: single producer + observer sync.
- [ ] Reset policy is clearly stated (if chain resets remain possible).
- [ ] Public docs include quickstart for observer node.
- [ ] RPC docs include examples for `/status`, `/block`, `/tx`, `/address`.

## 9) Go/No-Go Decision
Mark each item above as complete, then decide:

- Go: all items in sections 1, 2, 3, 4, and 8 are complete; remaining risk accepted and documented.
- No-Go: any critical item in sections 1, 2, 3, 4, or 8 is incomplete.

Decision log:
- Date:
- Release tag:
- Decision owner:
- Result (Go/No-Go):
- Open risks accepted:
