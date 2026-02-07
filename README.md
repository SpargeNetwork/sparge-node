# Sparge Chain Explorer (Pre-launch)

## Wallet + Signed Transactions (MVP)
- Create wallet: `npm run wallet create`
- Show wallet: `npm run wallet show` (add `--full` to show private key)
- Send tx: `npm run tx send --to <address> --amount <tokens> --fee <tokens> [--memo "..."]`

## Transaction Types (v1)
Canonical signing message:
`type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?`

Types:
- `transfer`: normal payments (from/to required).
- `register_participant`: registers `participant` sponsored by `from` (from pays bond + fee).
- `unregister_participant`: unregisters `from` and releases bond to sponsor.
- `heartbeat`: updates liveness for `from` (fee required).

## Participation Bootstrap
Genesis participant (patient 0) is auto-registered without a bond for itself. It can sponsor the first participants by sending `register_participant` transactions as the sponsor (`from`), which locks the bond.

## Breaking Change Note (Feb 2, 2026)
Address/public key format and txid changed. Reset chain data when upgrading:
- New address format: `spg_` + base58(sha256(pubKeyBytes)[0..20])
- Public key in JSON is raw 32-byte Ed25519 key (`publicKeyHex`)
- txid now hashes the canonical message only (no signature)
- Please reset chain data and wallet data for a clean start.

## Observer Node (Windows EXE)
An observer node is read-only: it syncs from a producer, validates blocks, and serves the Explorer UI without mining.
The Windows EXE embeds Node 18 (LTS). Your normal dev/prod setup can keep using newer Node versions.

Start:
- Download and run `SpargeObserver.exe`
- First run: enter Producer URL + local port, then it opens the Explorer

Data location:
- `%APPDATA%\\SpargeObserver\\` (config, data, logs)

If the producer is unreachable, the Explorer shows a sync error banner.


📺 Development logs: [https://youtube.com/@sparge](https://youtu.be/PzWenS1G968)
