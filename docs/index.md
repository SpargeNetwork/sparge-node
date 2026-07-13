# Sparge

Sparge is an experimental, JavaScript-native blockchain playground.

It exists to explore what happens when communities, code, and AI come together,
without pretending to be a financial system or an investment.

Sparge is desktop-first, community-driven, and intentionally minimal.
Things may change. Things may break. That is part of the experiment.

---

## What is Sparge?

Sparge is a blockchain built in JavaScript, designed as a playground rather than a product.

It focuses on:
- fast iteration
- clear and readable code
- community experimentation
- tooling that feels closer to infrastructure software than fintech apps

---

## What Sparge is not

Sparge is not:
- an investment
- a promise of value
- a bank or a fiat-backed system
- a finished decentralized consensus network

There are no guarantees about:
- uptime
- permanence
- future direction
- exchange listings

---

## Network Model (Current)

Current architecture is:
- producer node(s): create blocks
- observer nodes: sync and validate blocks, serve read-only explorer
- network overview: producer and observer health from recent observer heartbeats
- request validation: centralized `/api` body, param, and query schemas
- request size limits: route-specific JSON body caps and safe oversized-request errors
- rate limits: endpoint-specific API throttling, transaction concurrency caps, and trust proxy rules
- bounded mempool: producer transaction pool capacity, TTL, and metrics
- runtime invariants: chain/state/storage/mempool checks with fail-safe mining pause
- structured logging: request IDs, event names, redaction, file rotation, and operator diagnostics
- Docker: one non-root image for producer and observer modes with separate persistent volumes
- HTTPS/Caddy: public reverse proxy with TLS, security headers, and internal-only node ports
- Operator dashboard: disabled-by-default, loopback-only private producer monitoring
- Backups: versioned producer backup archives with metadata, checksums, restore verification, and startup audit
- Deterministic replay: read-only full-chain state reconstruction from genesis to a pinned tip

Observer sync is currently HTTP producer-to-observer, not full P2P consensus.

---

## Wallet and Keys

Sparge wallet keys are generated and stored locally.
Transactions are signed client-side or via local tooling.
Private keys are never sent to server endpoints.

---

## Status

Sparge is early-stage and experimental.

Expect:
- breaking changes
- evolving documentation
- occasional reset/migration steps between milestones

---

## Get Involved

- run a producer locally
- run an observer node
- test wallet and explorer flows
- report issues and edge cases
