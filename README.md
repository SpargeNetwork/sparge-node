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
- `/api/block/:height`
- `/api/tx/:txid`
- `/api/address/:addr`

## Notes

- Address format: `spg_` + base58(sha256(pubKeyBytes)[0..20])
- `publicKeyHex` is raw Ed25519 public key (32 bytes, 64 hex chars)
- `txid` hashes canonical message (signature not included)
