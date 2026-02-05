# Wallet

## Dev Wallet

- Browser-only, client-side key generation.
- Keys stored locally in the browser (no server storage).
- Supports transfer, register/unregister participant, heartbeat.
- Import/export is supported (JSON file).

## Address Format

`spg_` + base58(sha256(pubKey)[0..20])
