# Protocol Overview

## Addresses

- Ed25519 public key is raw 32 bytes.
- `publicKeyHex` is lowercase hex (64 chars).
- Address = `spg_` + base58(sha256(pubKeyBytes)[0..20]).

## Canonical Transaction Message

Signed message string:

```
type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?
```

- UTF-8 string with `|` separators
- numeric fields are decimal strings
- `memo` optional, max 128 chars

## TxID

`txid = sha256(utf8(message))`

## Transaction Types (submit)

Client-submittable tx types:
- `transfer`
- `register_participant`
- `unregister_participant`
- `heartbeat`

System-generated block tx types may include:
- `participant_reward`
- `holder_reward`
- `node_reward`
- `treasury_reward`
- `node_pool_accrual`
- `holder_pool_accrual`
