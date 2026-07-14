# Public API

The Sparge Explorer exposes a JSON API under `/api`. Use the official HTTPS API origin published by Sparge. Localhost examples in source-code documentation are development examples, not a separate public network.

## Common behavior

- JSON write requests require `Content-Type: application/json`.
- Identifiers and signed fields are validated strictly.
- List endpoints use bounded pagination or limits.
- Every response includes an `X-Request-ID` header.
- HTTP `413` means the request body is too large.
- HTTP `429` means the client must slow down and respect `Retry-After`.
- A queued transaction is not confirmed until included in a block.

## Chain

### `GET /api/status`

Returns chain identity, version information, node mode, health, height, latest hash, mempool aggregates, configured public economics, and Participant reward-ramp metadata. Supply fields include total supply, spendable circulating supply, and the rolling amount minted during the previous 24 hours in both base units and formatted tokens.

Applications should verify chain ID, genesis hash, protocol version, and economics version before enabling signed transactions.

Reward-related status fields are integer base-unit strings unless stated otherwise:

| Field | Meaning |
| --- | --- |
| `mintMicro` | Total new base units minted by the latest block. |
| `mintRatePpm` | Current annualized emission rate in parts per million; `50,000` means 5%. |
| `splitMicro.participant` | Latest block's 15% Participant Pool before maturity redistribution. |
| `splitMicro.nodePool` | Latest block's 70% Node Pool accrual. |
| `splitMicro.treasury` | Latest direct Treasury credit, including applicable per-block remainders. |
| `splitMicro.holderPool` | Latest block's 5% Holder Pool accrual. |
| `poolsMicro.node` | Complete Node Pool accumulated since the previous payout. |
| `poolsMicro.holder` | Complete Holder Pool accumulated since the previous payout. |
| `blocksUntilPayout` | Remaining blocks before both accumulated pools are processed. |
| `avgWindowBlocks` | Current block count used for the payout and holder-average window. |
| `avgEligibilityMicro` | Minimum average Holder balance in base units. |

`poolsMicro.node` and `poolsMicro.holder` are separate values, not a total and subset. Clients should not infer that an observer is eligible for Node Pool rewards. See [Block Rewards and Pool Payouts](protocol.md#block-reward-distribution).

### `GET /api/genesis`

Returns the canonical public genesis document used to verify chain identity.

## Balances and nonces

### `GET /api/balance/:address`

Returns the public address and confirmed balance in integer base units.

### `GET /api/nonce/:address`

Returns the confirmed sender nonce. Transaction builders must also account for sequential transactions already pending from the same sender.

## Blocks

### `GET /api/blocks?page=<page>&limit=<limit>`

Returns paginated recent blocks. Default limit is 10 and maximum limit is 50.

### `GET /api/block/:height`

Returns one block by non-negative integer height.

Reward transparency fields include `mintUnits`, `mintRatePpm`, `rewardBaseUnits`, and system reward/accrual transactions. `rewardBaseUnits` is the Participant Pool amount, not the complete block mint. Use `mintUnits` for total new tokens and inspect `node_pool_accrual`, `holder_pool_accrual`, `participant_reward`, and `treasury_reward` entries for destinations. Payout blocks can additionally include `node_reward`, `holder_reward`, and Treasury fallback or leftover entries.

### `GET /api/blocks?fromHeight=<height>&limit=<limit>`

Returns a bounded ascending block range used by observers. Maximum limit is 200.

### `GET /api/blocks/state`

Returns the current public chain-state representation used by node status.

## Transactions

### `GET /api/tx/:txid`

Returns a confirmed transaction. `txid` must be exactly 64 lowercase hexadecimal characters. Shortened display IDs are never valid API identifiers.

### `POST /api/tx`

Submits a locally signed transaction to the producer. Observer nodes reject writes with HTTP `403`.

Accepted canonical fields are:

```text
type, chainId, from, to, amountMicro, feeMicro, nonce,
publicKeyHex, signatureHex, sponsor, participant, memo
```

Supported client transaction types are `transfer`, `register_participant`, `heartbeat`, and `unregister_participant`.

A successful submission resembles:

```json
{
  "status": "queued",
  "txid": "<64 lowercase hex characters>",
  "message": "<canonical signed message>"
}
```

Poll `GET /api/tx/:txid` with the complete ID or inspect address history to determine confirmation.

## Addresses

### `GET /api/address/:address`

Returns public address aggregates, including balance/activity statistics and, when applicable, Participant and sponsorship data.

Important Participant fields include:

| Field | Meaning |
| --- | --- |
| `participant.status` | Current `active` or `inactive` eligibility. |
| `participant.sponsor` | Address that signed registration and locked the bond. |
| `participant.bondMicro` | Locked bond in integer base units. |
| `participant.registeredHeight` | Start of the current registration. |
| `participant.lastSeenHeight` | Latest qualifying on-chain activity. |
| `participant.rewardMaturityPercent` | Current effective maturity percentage. |
| `participant.rewardMaturityStage` | `New`, `Growing`, or `Mature`. |
| `participant.maturityAgeBlocks` | Current registration age in blocks. |
| `participant.blocksUntilNextMaturityStage` | Remaining blocks, or `null` at maturity. |

Sponsor aggregate fields include `sponsoredActiveCount`, `sponsoredInactiveCount`, `availableSponsorSlots`, `lockedBondMicro`, and `sponsoredParticipants`.

`reclaimableBondMicro` is `null`: Sponsor reclaim is unavailable in this protocol version.

### `GET /api/address/:address/txs?limit=<limit>`

Returns bounded address activity. Default limit is 50 and maximum limit is 100.

## Mempool

### `GET /api/mempool`

Returns public pending transaction and aggregate mempool information. The mempool is process-local; pending entries can disappear after restart.

## Network

### `GET /api/network/status`

Returns producer status, observer aggregates, chain and observer heights, average lag, block timing, and mempool size. Aggregate counts can include private observers. `publicActiveObserverCount` separately reports online, healthy observers that opted into public listing.

### `GET /api/network/observers?page=<page>&limit=<limit>`

Returns only observers that opted into public listing. Optional filters are `status`, `version`, and two-letter `country`.

The response does not expose raw IP addresses, hostnames, internal node IDs, machine metadata, or latest block hashes. It can return HTTP `403` when public listing is disabled while aggregate counts remain available.

### `POST /api/network/heartbeat`

Used by observer software to report recent health. Heartbeats update only the observer registry and cannot alter blocks, transactions, balances, validation, mining, or consensus.

## Community Identity

Community Identity is optional and disabled by default. It is off-chain.

### `GET /api/community/status`

Returns whether Discord linking and public profiles are available. It never returns Discord credentials or role IDs.

### `GET /api/community/discord/start`

Starts Discord OAuth with server-side, single-use state and redirects to Discord.

### `GET /api/community/discord/callback`

Validates OAuth state, reads the minimum Discord identity, verifies guild membership, rotates the session, and redirects back to the wallet. OAuth tokens are not returned to the browser.

### `GET /api/community/me`

Returns the current private session's safe link status, managed roles, privacy settings, and CSRF token. It does not return the immutable Discord user ID.

### `POST /api/community/challenge`

Creates a single-use wallet verification message bound to the authenticated Discord account and submitted wallet address.

### `POST /api/community/verify`

Verifies the exact challenge, public-key/address derivation, and Ed25519 signature before atomically consuming the challenge and creating the off-chain link.

### `POST /api/community/sync-roles`

Requests an idempotent role synchronization for the authenticated identity.

### `PATCH /api/community/privacy`

Updates the authenticated identity's separate public-profile visibility controls.

### `POST /api/community/unlink`

Requires explicit confirmation, removes only Sparge-managed automatic roles, disables the public profile, and unlinks the wallet.

### `GET /api/community/profile/:walletAddress`

Returns only explicitly enabled public fields. A private or missing profile returns `404`. Discord user IDs, OAuth data, internal IDs, private role errors, and balances without separate opt-in are never returned.

## Errors

| HTTP | Typical code | Meaning |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | Body, route parameter, or query is invalid. |
| 400 | `NONCE_TOO_FAR_AHEAD` | Sender nonce is beyond the accepted pending range. |
| 403 | `OBSERVER_READ_ONLY` | A write was sent to an observer. |
| 404 | varies | Block or transaction does not exist. |
| 409 | `MEMPOOL_DUPLICATE` | Transaction is pending or already confirmed. |
| 413 | `PAYLOAD_TOO_LARGE` | Request exceeded its byte limit. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | A JSON endpoint received another content type. |
| 429 | `RATE_LIMITED` | Request allowance was exhausted. |
| 429 | `MEMPOOL_SENDER_LIMIT` | Sender has too many pending transactions. |
| 503 | `MEMPOOL_FULL` | Producer mempool is at capacity. |

Error text can improve over time. Integrations should rely on HTTP status and documented machine-readable codes, not exact message wording.
