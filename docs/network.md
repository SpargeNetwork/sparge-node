# Network Overview

Sparge Chain currently uses one official producer. Observer nodes independently sync and validate the chain state, but they do not produce blocks and their heartbeats do not influence consensus.

Public observer listing is opt-in and disabled by default. Private observers still count toward aggregate network totals.

## Observer Heartbeats

Observer nodes send a heartbeat to the configured producer:

`POST /api/network/heartbeat`

The heartbeat includes a persistent random `nodeId`, observer version, current height, latest block hash, public-listing preference, and optional public alias/country when explicitly enabled. The producer determines the remote IP server-side for internal abuse handling and does not trust user-provided IP fields.

The observer stores its stable identity in its data directory as `observer-node-id.json`, so restarting the observer keeps the same identity. The node ID is random and is used internally only. It is not derived from hostnames, usernames, IP addresses, MAC addresses, or hardware IDs.

## Public Observer Data

`GET /api/network/status` returns aggregate counts for all observers, including private observers.

`GET /api/network/observers` returns only observers that opted into public listing. Public observer entries expose only:

- public alias, when explicitly provided
- country code, when explicitly provided
- version
- current height
- sync lag
- status
- last seen

Raw IP addresses, hostnames, usernames, machine metadata, internal node IDs, and latest block hashes are not returned by public observer-list APIs or explorer pages.

## Active Counts

Active observer counts are calculated from recent heartbeats, not from the total number of nodes ever seen.

Default status rules:

- `fully_synced`: observer height equals producer height and latest hash matches
- `syncing`: observer is online but behind the producer
- `mismatch`: observer reports the producer height with a different hash
- `offline`: no heartbeat within the configured timeout

Offline and mismatch nodes are not counted as healthy active observers.

## Configuration

Configure network settings in `config/config.yml`:

```yaml
network:
  heartbeatIntervalSeconds: 60
  observerOfflineAfterSeconds: 180
  observerRetentionDays: 180
  publicObserverListEnabled: true
  heartbeatRateLimit:
    windowMs: 60000
    max: 20
```

Observer privacy defaults:

```yaml
observer:
  publicListingEnabled: false
  publicAlias: ""
  countryCode: ""
```

Set `publicObserverListEnabled: false` to disable `GET /api/network/observers` while keeping aggregate counts available from `GET /api/network/status`.

Optional public-listing settings can be set with:

- `OBSERVER_PUBLIC_LISTING_ENABLED`
- `OBSERVER_PUBLIC_ALIAS`
- `OBSERVER_COUNTRY_CODE`

The local observer dashboard also provides privacy settings. Turning public listing off removes the observer from the public list on the next heartbeat while it remains included in aggregate counts.

## API

- `GET /api/network/status`: aggregate producer, observer, height, lag, block time, and mempool metrics.
- `GET /api/network/observers`: paginated public observer list for opted-in observers only. Supports `status`, `version`, `country`, `page`, and `limit`.
- `POST /api/network/heartbeat`: observer heartbeat endpoint.

## Retention

Offline observer records are kept for history and are not deleted immediately. Very old records are removed according to `network.observerRetentionDays`.
