# Protocol Overview

## Addresses

- Ed25519 public key is **raw 32 bytes**.
- `publicKeyHex` is lowercase hex (64 chars).
- Address = `spg_` + base58(sha256(pubKeyBytes)[0..20]).

## Transaction Canonical Message

Signed message string:

```
type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?
```

- Fields are UTF-8 strings with `|` separators.
- All numeric fields are decimal strings.
- `memo` is optional, max 128 chars.

## TxID

`txid = sha256(utf8(message))`

## Transaction Types

- transfer
- register_participant
- unregister_participant
- heartbeat
- participant_reward
- holder_reward
- node_reward
- treasury_reward
- node_pool_accrual
- holder_pool_accrual
