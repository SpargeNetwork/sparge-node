# Observer Node

An observer is a read-only Sparge node. It independently synchronizes blocks from the official producer, verifies chain identity and block continuity, applies state transitions locally, and serves its own explorer. Observers validate the chain but do not produce blocks or participate in consensus.

## Run from source

Set the node mode and producer URL in `config/config.yml`:

```yaml
node:
  mode: observer
  producerUrl: "http://localhost:3051"
```

Then start the node:

```powershell
npm start
```

Use a separate `DATA_DIR` when a producer and observer run on the same host. Never point both processes at the same SQLite database.

## Windows desktop observer

Build the installer with:

```powershell
npm run dist:observer:win
```

The installer is written to `release/Sparge-Observer-Setup-<version>.exe`. First-run setup asks for the producer URL and local observer port.

The desktop app stores its runtime files under `%APPDATA%\SpargeObserver\`:

- `config.json`: local observer settings
- `data\state.db`: synchronized chain state
- `logs\node.log`: runtime log

Release binaries belong in GitHub Releases, not in Git.

## Desktop updates

Installed Windows observers check the official `SpargeNetwork/sparge-node` GitHub Releases feed shortly after startup and every six hours while running. Update checks do not interrupt synchronization.

When an update is available:

1. The Observer dashboard shows the installed and available versions.
2. The operator explicitly starts the download.
3. The updater verifies the SHA-512 recorded in the release `latest.yml` metadata.
4. The operator explicitly chooses **Restart and Install** after the download completes.
5. Only then does the desktop shell stop the local observer backend and launch the installer.

Updates are never downloaded or installed silently. A failed check or download leaves the current observer running. Update IPC accepts no caller-provided URL, path, or installer arguments.

Version `0.1.1-alpha.0` does not contain the updater. Install `0.1.2-alpha.0` manually once; later compatible Public Alpha releases can use the in-app flow.

Public Alpha installers are currently not code-signed and can trigger Windows SmartScreen. Only use the official GitHub Release, and compare its published checksum before the initial manual installation. Code signing remains required before treating silent trust prompts as production-ready.

## Synchronization status

Query `GET /api/status` on the observer. Important fields include:

- `nodeMode`: must be `observer`
- `syncState`: `synced`, `syncing`, or `error`
- `syncedHeight`
- `producerHeight`
- `lagBlocks`
- `genesisHash`

Observer container health treats a fatal storage or invariant failure and `syncState: "error"` as unhealthy. Ordinary sync lag does not make the process itself unavailable.

## Heartbeats and network health

At the configured interval, an observer sends `POST /api/network/heartbeat` to its producer. The payload contains a persistent random node ID, client version, current height and hash, listing preference, and optional public alias and country.

The producer derives the remote IP from the connection. It does not accept a client-provided IP. Heartbeats update only the observer registry; they cannot alter chain state, block validation, mining, or consensus.

The stable identity is stored as `observer-node-id.json` in the observer data directory. Restarts retain the same identity. It is randomly generated and is not derived from a hostname, username, IP address, MAC address, or hardware identifier.

## Privacy and public listing

Public listing is opt-in and disabled for each observer by default:

```yaml
observer:
  publicListingEnabled: false
  publicAlias: ""
  countryCode: ""
```

Environment overrides are:

- `OBSERVER_PUBLIC_LISTING_ENABLED`
- `OBSERVER_PUBLIC_ALIAS`
- `OBSERVER_COUNTRY_CODE`

The local observer dashboard can change these privacy settings. Turning listing off removes the observer from the public list on its next heartbeat while retaining it in aggregate counts.

`GET /api/network/status` includes aggregate counts for public and private observers. `GET /api/network/observers` includes only opted-in observers and exposes, at most:

- public alias
- country code
- version
- current height
- synchronization lag
- status
- last-seen time

Public responses never expose raw IP addresses, hostnames, usernames, machine metadata, internal node IDs, or latest block hashes.

An operator can disable the public list globally with `network.publicObserverListEnabled: false`; aggregate network counts remain available.

## Status calculation

Active counts are calculated from recent heartbeats rather than all nodes ever registered:

- `fully_synced`: online, at producer height, and latest hash matches
- `syncing`: online but behind the producer
- `mismatch`: at producer height but reporting a different hash
- `offline`: no heartbeat within `observerOfflineAfterSeconds`

Offline and mismatch observers are not counted as healthy active observers. Records are retained until the configured retention period expires.

Default timing configuration:

```yaml
network:
  heartbeatIntervalSeconds: 60
  observerOfflineAfterSeconds: 180
  observerRetentionDays: 180
  publicObserverListEnabled: true
```

## Troubleshooting

`producer genesisHash mismatch` means the observer and producer belong to different chain histories. Preserve evidence if needed, remove only the observer data, and synchronize it again from the intended producer.

`prevHash mismatch` indicates local divergence. Stop the observer, preserve its database for diagnosis, then reset only its local data and resynchronize.

For connection failures, verify the producer URL, port, firewall, and DNS. Inside Docker Compose, use `http://producer:3051`, not `localhost`, because each container has its own loopback interface.

Running an observer never requires producer keys, producer configuration, or mining access. Keep the observer data directory separate, preserve privacy defaults, and use the local status page for health monitoring.
