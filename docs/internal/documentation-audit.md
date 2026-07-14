# Documentation Architecture Audit

This internal record captures the documentation inventory before the public-alpha refactor. It is intentionally excluded from `mkdocs.yml` navigation.

## Classification rules

- **Public**: useful to users, wallet users, integrators, and observer operators.
- **Operator**: needed to deploy or recover the official producer.
- **Internal**: maintainer release, review, evidence, and implementation process.
- **Stay**: remains standalone.
- **Merge**: unique content moved into a broader canonical guide; source removed.
- **Move**: document retained under a more appropriate path.
- **Archive**: retained only for historical context.

## Original inventory

| Original file | Purpose | Audience | Class | Action | Destination |
| --- | --- | --- | --- | --- | --- |
| `README.md` | Repository overview and quick start | All repository visitors | Public | Stay, rewrite | `README.md` |
| `SECURITY.md` | Vulnerability reporting policy | Security reporters | Public | Stay | `SECURITY.md` |
| `CONTRIBUTING.md` | Contribution workflow | Contributors | Public | Stay | `CONTRIBUTING.md` |
| `CHANGELOG.md` | Release history and known gaps | Users, operators, maintainers | Public | Stay | `CHANGELOG.md` |
| `LAUNCH_CHECKLIST_ALPHA.md` | Alpha Go/No-Go checklist | Maintainers | Internal | Move | `docs/internal/launch-checklist-alpha.md` |
| `PROTOCOL-HOLDER-AVERAGING.md` | Holder average/reward specification | Users and developers | Public | Merge | `docs/protocol.md` |
| `docs/index.md` | Project identity and network overview | All users | Public | Stay, rewrite | `docs/index.md` |
| `docs/manifesto.md` | Project principles | All users | Public | Merge | `docs/index.md` |
| `docs/wallet.md` | Wallet storage and address format | Wallet users | Public | Stay, expand | `docs/wallet.md` |
| `docs/observer.md` | Observer installation and troubleshooting | Observer operators | Public | Stay, expand | `docs/observer.md` |
| `docs/network.md` | Heartbeats, status, privacy, retention | Observer operators and developers | Public | Merge | `docs/observer.md`, `docs/rpc.md` |
| `docs/protocol.md` | Addresses and transaction format | Users and developers | Public | Stay, expand | `docs/protocol.md` |
| `docs/participation.md` | Registration, bonds, liveness | Participants and developers | Public | Merge | `docs/protocol.md` |
| `docs/rewards.md` | Reward split and payout | Users and developers | Public | Merge | `docs/protocol.md` |
| `docs/rpc.md` | HTTP endpoint summary | Integrators | Public | Stay, expand | `docs/rpc.md` |
| `docs/validation.md` | Schema-validation architecture | Developers | Public | Merge | `docs/developer-guide.md` |
| `docs/request-size-limits.md` | Body-parser and payload-limit behavior | Developers and operators | Operator | Merge | `docs/developer-guide.md`, `docs/operator-guide.md` |
| `docs/rate-limits.md` | Endpoint throttling behavior | Developers and operators | Operator | Merge | `docs/developer-guide.md`, `docs/reference/configuration.md` |
| `docs/mempool.md` | Bounded mempool behavior and monitoring | Developers and operators | Operator | Merge | `docs/developer-guide.md`, `docs/operator-guide.md` |
| `docs/invariants.md` | Runtime safety checks | Developers and operators | Operator | Merge | `docs/developer-guide.md`, `docs/operator-guide.md` |
| `docs/security.md` | Deployment security overview | All deployers | Public | Stay, rewrite | `docs/security.md` |
| `docs/logging.md` | Structured logs and privacy | Producer operators | Operator | Merge | `docs/operator-guide.md` |
| `docs/docker.md` | Container build and operation | Producer operators | Operator | Merge | `docs/operator-guide.md` |
| `docs/https-caddy.md` | Public TLS reverse-proxy deployment | Producer operators | Operator | Merge | `docs/operator-guide.md` |
| `docs/operator-dashboard.md` | Private dashboard security and metrics | Producer operators | Operator | Merge | `docs/operator-guide.md` |
| `docs/backups.md` | Versioned backup and restore | Producer operators | Operator | Merge | `docs/operator-guide.md` |
| `docs/replay.md` | Deterministic replay and failure handling | Producer operators and reviewers | Operator | Merge | `docs/operator-guide.md` |
| `docs/ops.md` | Broad operational runbook | Producer operators and maintainers | Operator | Merge | `docs/operator-guide.md`, `docs/internal/test-procedures.md` |
| `docs/faq.md` | Short public questions | All users | Public | Stay, expand | `docs/faq.md` |
| `docs/RELEASE_TEMPLATE.md` | GitHub release template | Maintainers | Internal | Move | `docs/internal/release-template.md` |
| `docs/REVIEW_PACKET.md` | External review instructions | Maintainers and reviewers | Internal | Move | `docs/internal/review-packet.md` |
| `docs/REVIEW_EVIDENCE_TEMPLATE.md` | Review evidence worksheet | Maintainers and reviewers | Internal | Move | `docs/internal/review-evidence-template.md` |

## Duplication found

- Local startup, mining toggles, observer startup, Docker commands, and data paths appeared in README plus several guides.
- Docker architecture, volume safety, health checks, shutdown, backups, and upgrades were repeated across Docker, HTTPS, backup, and ops documents.
- Caddy topology, proxy trust, CORS, body limits, blocked operator routes, and security headers appeared in HTTPS, security, rate-limit, and dashboard documents.
- Logging paths, rotation, environment variables, redaction, and event names appeared in logging and ops documents.
- Backup/restore commands and disaster recovery appeared in backup, replay, Docker, security, and ops documents.
- Validation, body-parser order, rate-limit order, error responses, trust proxy, and privacy logging were split across three API-security documents.
- Mempool and invariant metrics appeared in their feature guides, ops, status API notes, and dashboard notes.
- Addresses, canonical messages, participation rules, reward splits, and holder averaging were spread across four protocol documents and README.
- Release test commands and the missing protocol-suite warning appeared in changelog, invariants, replay, ops, release template, and review templates.

## Resulting ownership

- `protocol.md` owns protocol and economics explanations.
- `rpc.md` owns endpoint descriptions.
- `developer-guide.md` owns shared HTTP validation, protection, mempool, and invariant implementation behavior.
- `operator-guide.md` owns producer operation and recovery procedures.
- `reference/configuration.md` owns configuration examples and override names.
- `security.md` owns the concise public security posture; operational procedures link to the Operator Guide.

No source document was archived unchanged. Documents were either retained, moved internally, or merged after their unique information was incorporated.
