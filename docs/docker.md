# Docker

Sparge provides one production-oriented Docker image that can run as either a producer or observer by changing environment variables.

## Prerequisites

- Docker Engine with Compose v2.
- Enough disk space for durable chain state volumes.
- Host ports `3051` and `3052` available, unless overridden in `.env`.

## Build

```powershell
docker build -t sparge-node:test .
```

The image uses `node:20-bookworm-slim`, installs production dependencies with `npm ci --omit=dev`, runs `node server/index.js`, and executes as the non-root `node` user.

## Compose Quick Start

The default Compose file is for local development and testing. It publishes producer and observer ports directly on the host.

```powershell
docker compose up -d --build
docker compose ps
```

Producer explorer:
- `http://localhost:3051`

Observer explorer:
- `http://localhost:3052`

The observer uses the Compose service name:

```text
PRODUCER_URL=http://producer:3051
```

Do not use `localhost` for producer-to-observer traffic inside Compose.

For internet-facing HTTPS deployment, use Caddy instead:

```powershell
docker compose -f docker-compose.production.yml up -d --build
```

See `docs/https-caddy.md`.

## Services

`producer`:
- `NODE_MODE=producer`
- `PORT=3051`
- `DATA_DIR=/app/data`
- named volume: `sparge-producer-data`

`observer`:
- `NODE_MODE=observer`
- `PORT=3052`
- `DATA_DIR=/app/data`
- `PRODUCER_URL=http://producer:3051`
- named volume: `sparge-observer-data`

The two services do not share a data volume.

## Environment

Supported container environment variables include:
- `PORT`
- `DATA_DIR`
- `NODE_MODE`
- `PRODUCER_URL`
- `CONFIG_PATH`
- `CORS_ALLOW_ORIGINS`
- `DEV_ENABLE_ADMIN`
- `LOG_LEVEL`
- `LOG_FORMAT`
- `LOG_DIRECTORY`
- `LOG_CONSOLE_ENABLED`
- `LOG_FILE_ENABLED`
- request-size limit env vars such as `MAX_JSON_BODY_BYTES`

Compose publishes host ports with optional `.env` values:

```text
SPARGE_PRODUCER_PORT=3051
SPARGE_OBSERVER_PORT=3052
```

Do not put secrets or production keys in `.env` or `docker-compose.yml`.

## Volumes and Data

Durable state lives in named volumes:
- `sparge-producer-data`
- `sparge-observer-data`

SQLite state and `genesis.json` are stored under `/app/data` inside each container. Runtime data is not stored in the image layer.

`docker compose down` removes containers and networks but keeps named volumes.

`docker compose down -v` deletes named volumes and therefore deletes chain data. Treat it as destructive.

For bind mounts, ensure the host directory is writable by the container user. The image runs as the non-root `node` user.

## Health Checks

The image includes `scripts/docker-healthcheck.js`, which calls `http://127.0.0.1:$PORT/api/status`.

Producer health requires:
- API response is reachable.
- `healthy`, `chainHealthy`, and `storageHealthy` are not `false`.

Observer health requires:
- API response is reachable.
- fatal invariant/storage health is not false.
- `syncState` is not `error`.

Observer health does not require the observer to be fully synced. Sync lag is operational status, not container liveness.

## Logs

Container defaults:

```text
LOG_FORMAT=json
LOG_CONSOLE_ENABLED=true
LOG_FILE_ENABLED=false
```

Use Docker logs:

```powershell
docker compose logs -f producer
docker compose logs -f observer
```

If file logs are explicitly needed, set `LOG_FILE_ENABLED=true`. Keep `LOG_DIRECTORY` under `/app/data` so logs go to the writable volume.

## Security Model

Compose applies:
- non-root container user
- no privileged mode
- no host network mode
- no Docker socket mount
- no broad host filesystem mount
- read-only root filesystem
- writable `/app/data` volume
- tmpfs `/tmp`
- `no-new-privileges`
- dropped Linux capabilities

`trustProxy` remains false by default. Operator/debug endpoints keep the existing app-level protections.

## Graceful Shutdown

Run:

```powershell
docker compose stop
```

Compose sends `SIGTERM` to the Node process. `server/index.js` handles shutdown, stops observer sync/heartbeat loops, closes the HTTP server, and allows SQLite writes to finish. Compose uses a `30s` stop grace period before forcing termination.

## Backups

Before upgrades or risky changes, back up the named volumes.

One safe pattern is to stop services first:

```powershell
docker compose stop
```

Then copy data from the named volume using a temporary helper container or your platform's Docker volume backup tooling. Keep producer and observer backups separate.

## Upgrade Flow

1. Back up producer and observer data.
2. Build or pull the new image.
3. Stop services gracefully:
   ```powershell
   docker compose stop
   ```
4. Start with the same volumes:
   ```powershell
   docker compose up -d --build
   ```
5. Verify `/api/status`, height, `genesisHash`, and health on both services.
6. If startup audit fails, stop and roll back to the previous image with the same backed-up data.

## Verification Checklist

```powershell
docker compose config
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:3051/api/status
Invoke-RestMethod http://localhost:3052/api/status
docker compose logs --tail=100 producer
docker compose logs --tail=100 observer
docker compose exec producer id
docker compose stop
docker compose up -d
```

Check:
- producer becomes healthy
- observer becomes healthy
- producer can mine blocks after consciously enabling local admin controls with `DEV_ENABLE_ADMIN=true` for testing, then running `npm run mine:start` against port `3051`
- observer sync height follows producer height
- data persists after `docker compose down` and `docker compose up -d`
- producer and observer volumes are separate
- logs appear in Docker logs
- process user is non-root
- graceful shutdown exits cleanly

## Current Limitations

- This task does not add HTTPS, reverse proxy, cloud deployment, dashboards, or consensus changes.
- The image does not include Electron observer desktop tooling.
- Production key custody is not changed. Wallet/private keys remain local to client tooling; do not mount private keys into containers unless a future explicit signing/key-management design requires it.
- `docker compose down -v` is destructive because it removes chain data volumes.
