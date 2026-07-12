# RPC

Base path: `/api`

## Status / Genesis

- `GET /api/status`
- `GET /api/genesis`

Selected status fields:
- `nodeMode`, `producerUrl`, `syncState`
- `syncedHeight`, `producerHeight`, `lagBlocks`
- `genesisOperatorAddress`, `genesisFreeBlocks`, `genesisFreeUsed`
- `producerAddress`, `treasuryAddress`, `nodePoolAddress`, `holderPoolAddress`
- `decimals`, `baseFeeMicro`, `minFeeMicro`

## Balances / Nonce

- `GET /api/balance/:addr`
- `GET /api/nonce/:addr`

## Blocks

- `GET /api/blocks?page=<n>&limit=<n>`
- `GET /api/blocks/state`
- `GET /api/blocks?fromHeight=<n>&limit=<n>` (producer sync feed)
- `GET /api/block/:height`

## Transactions

- `GET /api/tx/:txid`
- `POST /api/tx`

`POST /api/tx` body fields:

```
type, chainId, from, to, amountMicro, feeMicro, nonce,
publicKeyHex, signatureHex, sponsor, participant, memo
```

Notes:
- In observer mode, `POST /api/tx` returns `403`.
- Canonical message order includes `type` as first field.
- Transaction payloads are strict. Empty fields such as `to`, `sponsor`, `participant`, and `memo` must be sent as empty strings when the transaction type does not use them.
- Malformed params, queries, and request bodies return a structured `VALIDATION_ERROR`; see `docs/validation.md`.

## Address

- `GET /api/address/:addr`
- `GET /api/address/:addr/txs?limit=50`
