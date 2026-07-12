# Request Validation

All public `/api` input is validated before route business logic runs.

The validation layer lives in `server/lib/validation/`:

- `schemas.js`: reusable schemas for request bodies, params, and queries
- `middleware.js`: `validateBody`, `validateParams`, and `validateQuery`
- `errors.js`: standard `VALIDATION_ERROR` response handling

No blockchain, signature, sync, storage, or state-transition rule is replaced by schema validation. Schema validation only rejects malformed input before the existing logic performs cryptographic and state checks.

## Error Format

Invalid requests return HTTP `400`:

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

Responses do not include stack traces, file paths, or rejected payloads.

## Common Rules

- Addresses must match the current Sparge format: `spg_` plus base58 payload.
- Chain IDs are lowercase alphanumeric strings with hyphens, max 64 characters.
- Transaction and block hashes are 64 lowercase hex characters.
- Ed25519 public keys are 64 lowercase hex characters.
- Ed25519 signatures are 128 lowercase hex characters.
- Heights and pagination values must be canonical base-10 integers.
- Transaction `amountMicro`, `feeMicro`, and `nonce` are canonical decimal strings.
- Memo is optional and limited to 128 characters.
- Unknown fields are rejected for transaction, heartbeat, observer settings, and validated query inputs.

## Pagination

Defaults and caps:

- `GET /api/blocks`: `page=1`, `limit=10`, max `limit=50`
- `GET /api/blocks?fromHeight=...`: default `limit=50`, max `limit=200`
- `GET /api/address/:addr/txs`: default `limit=50`, max `limit=100`
- `GET /api/network/observers`: `page=1`, `limit=25`, max `limit=100`

Values above the cap are rejected instead of silently capped.

## Transaction Schema

`POST /api/tx` accepts only:

```text
type, chainId, from, to, amountMicro, feeMicro, nonce,
publicKeyHex, signatureHex, sponsor, participant, memo
```

Supported `type` values:

- `transfer`
- `register_participant`
- `unregister_participant`
- `heartbeat`

Type-specific field rules are enforced before the existing signature, chain ID, nonce, fee, balance, replay, and participant-state checks run.

## Observer Heartbeat Schema

`POST /api/network/heartbeat` accepts only:

```text
nodeId, nodeMode, version, height, latestHash,
publicListingEnabled, publicAlias, countryCode
```

Rules:

- `nodeMode` must be `observer`.
- `nodeId` must be a stable bounded node identifier.
- `version` is max 32 safe version characters.
- `height` is a non-negative safe integer.
- `latestHash` is empty or a 64-character lowercase block hash.
- `publicAlias` is trimmed and rejects control characters, line breaks, markup, script-like content, and URLs.
- `countryCode` is normalized to uppercase and must be a supported ISO 3166-1 alpha-2 code.
- Hostname-related fields such as `hostname`, `computerName`, `deviceName`, and `username` are rejected.
- When `publicListingEnabled` is false, public alias and country are discarded.

## Adding Validation

For a new route:

1. Add or reuse a schema in `server/lib/validation/schemas.js`.
2. Attach it before the handler with `validateBody`, `validateParams`, or `validateQuery`.
3. Keep business, cryptographic, consensus, and storage validation in the existing service layer.
4. Use allowlists for any filter or sort values that can affect storage queries.
