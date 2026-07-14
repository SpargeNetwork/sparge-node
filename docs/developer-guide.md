# Builder Guide

This guide is for developers building wallets, dashboards, explorers, bots, or other applications on the existing Sparge network. Producer deployment and chain configuration are intentionally outside this public guide.

## Start with read-only integration

Use the official HTTPS API origin announced by Sparge. Begin with:

- `GET /api/status` for chain identity and current height;
- `GET /api/block/:height` for a block;
- `GET /api/tx/:txid` for a confirmed transaction;
- `GET /api/address/:addr` for public address state;
- `GET /api/address/:addr/txs` for activity;
- `GET /api/network/status` for aggregate network health.

The [Public API](rpc.md) is the endpoint reference.

## Verify network identity

Do not identify a network by hostname alone. Read `GET /api/status` and `GET /api/genesis`, then pin the expected chain ID, genesis hash, protocol version, and economics version for your application.

Stop writes and show a clear compatibility error when those values do not match what your client supports.

## Amounts and identifiers

- Treat all `*Micro` amount fields as decimal integer strings.
- Do not use JavaScript floating-point numbers for signed or protocol amounts.
- Addresses begin with `spg_` and must pass the protocol address validator.
- Transaction IDs and hashes are exactly 64 lowercase hexadecimal characters.
- Keep full identifiers in links, route state, API requests, and copy controls.
- Shorten identifiers only in visible display text.

The current token uses nine decimals. Format for display without changing the underlying integer value.

## Signing transactions

Transactions are signed client-side with Ed25519. Never send private keys to an API.

The canonical UTF-8 message is:

```text
type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?
```

The transaction ID is SHA-256 of the canonical message bytes and excludes the signature. Unused canonical fields must be supplied exactly as required by the transaction type. Do not trim, normalize, shorten, or reorder signed values.

Before signing:

1. Fetch the confirmed nonce with `GET /api/nonce/:addr`.
2. Account for sequential transactions already pending from that sender.
3. Use the expected chain ID.
4. Build the canonical fields in their defined order.
5. Sign locally and submit to the official producer.

A successful `POST /api/tx` response means queued, not confirmed. Poll the full transaction ID or address history until it appears in a block.

## Validation and errors

The API validates request bodies, route parameters, and query parameters strictly. Clients should handle:

- `400` invalid request or protocol/business validation;
- `403` write attempted against a read-only observer;
- `404` block or transaction not found;
- `409` duplicate pending or confirmed transaction;
- `413` request body too large;
- `415` unsupported content type;
- `429` rate limited;
- `503` producer or mempool temporarily unavailable.

Use HTTP status and machine-readable error code where present. Do not parse human-readable messages as stable contracts. Respect `Retry-After` and apply bounded exponential backoff for temporary failures.

## Pagination and polling

Always use bounded page sizes. Cache immutable confirmed blocks and transactions. Poll status or pending activity at a modest interval and pause polling when the page is hidden.

Do not repeatedly fetch complete histories. Use the documented address-history and block limits.

## Participation UI

Use the additive fields returned by `GET /api/address/:addr` and `GET /api/status` instead of re-creating network configuration in the frontend.

Clearly distinguish Not registered, Pending, Active, and Inactive. Show Reward Maturity as eligibility information, not guaranteed income. Sponsorship must never be described as wallet control, delegation, commission, or reward sharing.

## Privacy

Do not collect private keys, wallet exports, request bodies containing signed payloads, complete signatures, internal observer IDs, raw IPs, or unnecessary user metadata.

Chain addresses and confirmed activity are public. Explain that distinction to users before connecting analytics or third-party services.

## Compatibility

Public Alpha can introduce explicit protocol or API changes. Pin supported versions, test against announced upgrades, and keep a user-visible incompatible-network state. Never silently reinterpret old signed transactions.
