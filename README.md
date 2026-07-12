# Sparge Chain (Pre-launch, Experimental)

Sparge is experimental software.
No financial guarantees. Not an investment. Breaking changes may happen before stable launch.

## Quick Start (Producer Node)

- Install dependencies: `npm install`
- Start producer node + explorer: `npm start`
- Start block production: `npm run mine:start`
- Stop block production: `npm run mine:stop`

Default producer URL: `http://localhost:3051`

## Dev Admin Toggle (Local Testing)

Admin endpoints are disabled by default (`dev.enableAdmin: false`).

Use env override when you need local mining controls without editing config:

- PowerShell enable: `$env:DEV_ENABLE_ADMIN="true"`
- PowerShell disable: `$env:DEV_ENABLE_ADMIN="false"`
- Clear override: `Remove-Item Env:DEV_ENABLE_ADMIN -ErrorAction SilentlyContinue`

Then start node as usual: `npm start`

## Wallet + Signed Transactions (CLI)

- Create wallet: `npm run wallet create`
- Show wallet: `npm run wallet show` (add `--full` to show private key)
- Send tx: `npm run tx send --to <address> --amount <tokens> --fee <tokens> [--memo "..."]`

## Transaction Types (v1)

Canonical signing message:
`type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?`

Types:
- `transfer`
- `register_participant`
- `unregister_participant`
- `heartbeat`

## Observer Node (Read-only)

Observer mode:
- syncs blocks from a producer
- validates/applies blocks locally
- serves explorer UI
- rejects tx submission (`POST /api/tx` -> `403`)
- sends a periodic private heartbeat to the producer so aggregate network health can count active observers
- public observer listing is opt-in; hostnames and IP addresses are not publicly displayed

Run observer from source:
- set in config: `node.mode: observer`
- set producer URL: `node.producerUrl: "http://localhost:3051"`
- start: `npm start`

## Windows Observer Desktop App (Electron)

Build installer:
- `npm run dist:observer:win`

Output:
- `release/Sparge Observer Setup 0.1.0.exe`

First run:
- opens setup flow inside the app
- asks `producerUrl` and local observer port
- stores data under `%APPDATA%\SpargeObserver\`

## API Base

All JSON endpoints are under `/api`.
Examples:
- `/api/status`
- `/api/network/status`
- `/api/network/observers`
- `/api/block/:height`
- `/api/tx/:txid`
- `/api/address/:addr`

## Release Discipline

- Changelog: `CHANGELOG.md`
- Release notes template: `docs/RELEASE_TEMPLATE.md`

## API Safety

Malformed API bodies, route params, and query strings are rejected with a structured `VALIDATION_ERROR` response before route logic runs. See `docs/validation.md`.
Oversized JSON bodies are rejected with `PAYLOAD_TOO_LARGE` before schema validation. See `docs/request-size-limits.md`.
Public API routes use endpoint-specific in-memory rate limits and return `RATE_LIMITED` with `Retry-After` when exceeded. See `docs/rate-limits.md`.

## Notes

- Address format: `spg_` + base58(sha256(pubKeyBytes)[0..20])
- `publicKeyHex` is raw Ed25519 public key (32 bytes, 64 hex chars)
- `txid` hashes canonical message (signature not included)
