# Node Development Guide

This internal guide explains the HTTP boundary and implementation safeguards maintainers must account for when extending a Sparge node. The public [API reference](../rpc.md) owns externally supported endpoint contracts; this guide covers node internals.

## API conventions

All JSON endpoints use the `/api` prefix. Amounts and nonces are decimal strings where specified so clients do not lose integer precision. Hashes and encoded keys use lowercase hexadecimal. Clients should treat unknown response fields as forward-compatible additions and should not infer confirmation from mempool admission.

Every API request receives an `X-Request-ID`. A safe incoming `X-Request-ID` or `X-Correlation-ID` can be reused; malformed IDs are replaced. Include this value when reporting a failed request, but never include private keys, complete signatures, or sensitive request bodies.

## Validation pipeline

Public input is validated before route business logic runs. Reusable schemas and middleware live under `server/lib/validation/`:

- `schemas.js`: body, parameter, and query schemas
- `middleware.js`: `validateBody`, `validateParams`, and `validateQuery`
- `errors.js`: structured validation responses

Schema validation rejects malformed input; it does not replace signature, chain ID, nonce, fee, balance, sync, storage, state-transition, or consensus checks.

Common rules include:

- addresses must use the current `spg_` plus base58 format
- chain IDs are lowercase alphanumeric/hyphen strings of at most 64 characters
- block and transaction hashes are 64 lowercase hex characters
- Ed25519 public keys and signatures are respectively 64 and 128 lowercase hex characters
- heights and pagination are canonical non-negative base-10 integers
- `amountMicro`, `feeMicro`, and `nonce` are canonical decimal strings
- memos are limited to 128 characters and 128 UTF-8 bytes
- unknown fields are rejected on strict bodies and validated queries

Invalid input returns HTTP `400` without stack traces, paths, or rejected payloads:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "height",
      "reason": "Expected a non-negative safe integer"
    }
  ]
}
```

When adding a route, add or reuse a schema, attach it before the handler, retain cryptographic and state validation in the service layer, and allowlist any value used for filtering or storage queries.

## Transaction schema

`POST /api/tx` accepts only:

```text
type, chainId, from, to, amountMicro, feeMicro, nonce,
publicKeyHex, signatureHex, sponsor, participant, memo
```

The accepted transaction types and canonical message are summarized in the public [protocol guide](../protocol.md#transaction-types). Fields unused by a transaction type must be supplied as empty strings where required by the canonical payload; signed fields are never truncated or normalized by the server.

After shape validation, the producer checks chain identity, public-key derivation, signature, type-specific fields, participant state, minimum fee, balance including pending spend and bond, sequential nonce, duplicates, and mempool capacity.

## Observer heartbeat schema

`POST /api/network/heartbeat` accepts only:

```text
nodeId, nodeMode, version, height, latestHash,
publicListingEnabled, publicAlias, countryCode
```

- `nodeMode` must be `observer`.
- `nodeId` uses a bounded stable-identifier format and at most 128 UTF-8 bytes.
- `version` allows at most 32 safe characters and 64 UTF-8 bytes.
- `height` is a non-negative safe integer.
- `latestHash` is empty or a 64-character lowercase hash.
- `publicAlias` is at most 40 characters and 80 UTF-8 bytes, and rejects control characters, line breaks, markup, script-like content, and URLs.
- `countryCode` is normalized to a supported uppercase ISO 3166-1 alpha-2 code.
- Hostname, computer, device, and username fields are rejected.
- Alias and country are discarded when public listing is disabled.

Remote IP is derived server-side. See [Observer privacy](../observer.md#privacy-and-public-listing).

## Request-size protection

Only routes that accept JSON install JSON parsers: transaction submission, observer heartbeat, and local observer settings. There is no global URL-encoded, text, raw, or multipart parser.

The request flow is:

1. CORS and request metadata
2. global and endpoint rate limits
3. global `Content-Length` precheck
4. route-specific JSON parser and byte limit
5. schema validation
6. cryptographic, state, and business validation
7. route handler
8. request-size and validation error handlers

Compressed bodies and unsupported encodings are rejected. JSON routes require `Content-Type: application/json`.

Default body limits are:

| Scope | Default |
| --- | ---: |
| Global JSON precheck | 32,768 bytes |
| Transaction | 16,384 bytes |
| Observer heartbeat | 4,096 bytes |
| Observer settings | 4,096 bytes |

Limits must be safe integers from 512 through 1,048,576 bytes. A route limit cannot exceed the global limit. HTTP `413` returns `PAYLOAD_TOO_LARGE`; HTTP `415` returns `UNSUPPORTED_MEDIA_TYPE`; malformed JSON and schema failures remain HTTP `400`.

Reverse proxies should enforce an equal or stricter cap. The production Caddy configuration uses a 32 KB global limit while the application retains authoritative route-specific limits.

## Endpoint rate limits

Sparge applies a process-local global fallback and endpoint-specific limiters. The transaction route also limits concurrent requests per effective client IP. Heartbeats use one per-IP limiter before parsing and one per-node-ID limiter after validation, so invalid payloads consume the IP allowance but unvalidated node IDs are never trusted.

Default groups are:

| Group | Window | Default maximum |
| --- | ---: | ---: |
| Global API | 60 seconds | 300 requests |
| Transaction | 60 seconds | 10 per IP; 3 concurrent |
| Heartbeat | 60 seconds | 10 per IP; 2 per node ID |
| Observer settings | 60 seconds | 10 per IP |
| Address/history | 60 seconds | 30 per IP |
| Block/transaction lookup | 60 seconds | 60 per IP |
| Public read | 60 seconds | 120 per IP |
| Operator | 60 seconds | 5 per IP |

HTTP `429` includes `Retry-After` and standard `RateLimit-*` headers:

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again later.",
  "retryAfterSeconds": 42
}
```

Counters reset on restart and are not shared across workers or producer instances. Scaling out requires a shared store or an upstream edge limiter.

`security.trustProxy` is false by default, so spoofed forwarding headers do not select the client IP. Behind the supplied Caddy topology, trust exactly one controlled hop with `SECURITY_TRUST_PROXY=1`. Do not broadly trust arbitrary proxies.

## Bounded mempool

The producer mempool is in-memory and bounded by total count, deterministic serialized bytes, per-sender count, transaction TTL, and future nonce distance. It uses a transaction-ID map, deterministic insertion order, sender counters, byte accounting, and cumulative rejection/expiry metrics.

Admission preserves all existing validation and then checks:

1. duplicate pending transaction
2. duplicate confirmed transaction
3. excessive future nonce
4. per-transaction serialized size
5. per-sender pending count
6. global transaction count
7. global byte capacity
8. insertion and index updates

Nonce gaps remain disallowed. `maxFutureNonceGap` rejects absurdly distant values but does not enable out-of-order execution. TTL uses an internal admission timestamp rather than client time and is enforced during admission, reads, spend/nonce checks, and block selection.

The full-pool policy rejects new transactions rather than evicting nonce-dependent entries by fee:

- `MEMPOOL_FULL`: HTTP `503`
- `MEMPOOL_SENDER_LIMIT`: HTTP `429`
- `NONCE_TOO_FAR_AHEAD`: HTTP `400`
- `MEMPOOL_DUPLICATE`: HTTP `409`

`minimumFeeMicro` is an admission setting, not a new protocol fee rule; transaction routes still enforce the configured protocol minimum. The mempool is not durable, so restarts clear pending transactions and metrics.

`GET /api/mempool` retains the pending list for compatibility. Public operators should account for the privacy impact because pending public transaction fields include memos and signatures.

## Runtime invariants

Runtime invariants detect impossible chain, state, storage, and mempool conditions. They are a safety layer and do not replace validation or consensus.

Fast checks run on candidate producer and observer blocks before storage commit. They verify identity and version fields, continuity, hashes, transaction count and types, candidate state root, non-negative balances/nonces, supply bounds, participant shape, and mempool accounting. A failed observer block is rejected; a producer can pause mining before committing the candidate mutation.

Full audits check stored height order, duplicate heights/hashes/transaction IDs, block/header consistency, monotonic timestamps, current state root, latest metadata, SQLite integrity, and mempool accounting. Startup audit and optional interval audits are configurable.

The local/debug-only `GET /api/debug/invariants` delegates to the full audit and remains protected by the existing local debug guard. Monitor the health fields documented in the [Operator Guide](operator-guide.md#runtime-invariants).

Deterministic replay rebuilds state from genesis through the production block-apply path. It is stronger historical reconstruction evidence than a bounded runtime audit, but it is not formal verification or an external audit.

## Logging and privacy

Validation, size-limit, rate-limit, admission, and unexpected API errors are structured events correlated with the request ID. Security rejection logs are throttled and contain only safe metadata such as method, route, status, limit/group, and generic source information.

Logs must not contain request bodies, private keys, secrets, full signatures, complete raw transactions, memos, aliases, hostnames, usernames, raw IPs, forwarding headers, or complete internal observer IDs. Operational logging details live in the [Operator Guide](operator-guide.md#logging).

## Testing

Run focused suites after changing the HTTP or state boundary:

```powershell
npm run test:validation
npm run test:request-size
npm run test:rate-limits
npm run test:mempool
npm run test:invariants
npm run test:network
```

The repository currently has no `npm run test:protocol` command because its referenced script was absent from the checkout and available history. Existing economics, invariants, stability, and replay suites provide related evidence but do not replace dedicated signed-transaction and participant-lifecycle protocol coverage.
