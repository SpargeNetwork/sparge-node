# RPC

Base path: `/api`

## Status

`GET /status`

## Balance / Nonce

`GET /balance/:addr`  
`GET /nonce/:addr`

## Blocks / Transactions

`GET /block/:height`  
`GET /tx/:txid`

## Address

`GET /address/:addr`  
`GET /address/:addr/txs?limit=50`

## Submit Transaction

`POST /tx`

Body includes:

```
type, chainId, from, to, amountMicro, feeMicro, nonce,
publicKeyHex, signatureHex, sponsor, participant, memo
```

