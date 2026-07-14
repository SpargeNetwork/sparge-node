# Sparge Public Alpha Launch Checklist

Internal scope: single-producer public alpha with observer validation. Complete this Go/No-Go gate before inviting external users.

## Security baseline

- [ ] Public configuration has `dev.enableAdmin: false`.
- [ ] Operator Dashboard is disabled or reachable only through an approved private channel.
- [ ] Producer and observer ports are not internet-facing behind Caddy.
- [ ] Endpoint rate limits and request-size limits are enabled.
- [ ] CORS uses exact production origins.
- [ ] Observer mode rejects transaction submission.
- [ ] Sync feeds use bounded ranges and rate limits.

## Stability baseline

- [ ] Producer cold-starts from an intentionally empty directory.
- [ ] Restart preserves genesis and height continuity.
- [ ] Fresh observer synchronizes from genesis to tip.
- [ ] Observer reconnects and catches up after producer downtime.
- [ ] Genesis and previous-hash divergence are rejected.

## Data safety and recovery

- [ ] Versioned producer backup has been created and verified.
- [ ] Backup restores on a separate target.
- [ ] Restored data passes startup audit and deterministic replay.
- [ ] Producer and observer data paths/volumes are recorded.
- [ ] Off-site retention and incident roles are assigned.

## Protocol confidence

- [ ] Runtime invariants pass.
- [ ] Nonce and mempool behavior is tested under realistic load.
- [ ] Reward accounting conserves the expected split.
- [ ] Participant active-window boundaries are tested.
- [ ] Bond registration, liveness, and release flows are tested.
- [ ] Missing dedicated protocol-suite coverage is explicitly accepted or resolved.
- [ ] Independent review has covered transaction validation and state transitions.

## Economics

- [ ] Sybil-style registration scenarios are tested.
- [ ] Holder payout-window boundaries are tested.
- [ ] Sponsor caps and free-rider rejection are tested.
- [ ] Known economic limitations are public.

## Release and operations

- [ ] Version tag and release notes identify chain, protocol, and economics versions.
- [ ] Changelog contains breaking changes and migration notes.
- [ ] Clean-machine build is reproducible.
- [ ] Installer artifacts and checksums are published outside Git.
- [ ] Health monitoring, log retention, uptime target, alert path, and incident contacts are active.

## User clarity

- [ ] Public docs identify Sparge as experimental and not an investment.
- [ ] Single-producer architecture and observer role are explicit.
- [ ] Reset and migration policy is stated per release.
- [ ] Observer quick start and RPC examples are current.

## Decision

- Date:
- Release tag and commit:
- Decision owner:
- Result (Go/No-Go):
- Accepted risks:
- Rollback target:
