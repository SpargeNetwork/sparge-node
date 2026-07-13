# Security Notes

Sparge is pre-launch experimental software. Treat public deployments as public-alpha infrastructure.

## Public HTTPS Deployment

Use the Caddy production Compose setup for internet-facing explorer/API deployments:

- Caddy is the only public service on ports `80` and `443`.
- Producer and observer application ports stay on the internal Docker network.
- Express uses `SECURITY_TRUST_PROXY=1` only for the Caddy deployment.
- Caddy overwrites forwarding headers before proxying to the producer.
- Caddy blocks operator write/debug routes before they reach Express.
- The private Operator Dashboard is disabled by default and blocked by Caddy in production.

See `docs/https-caddy.md`.

## Operator Controls

Mining start/stop endpoints are disabled by default and require local access when enabled. Do not expose operator controls directly to the internet.

## CORS

Production should use same-origin explorer/API traffic where possible. If cross-origin access is required, allow exact origins only. Do not use wildcard CORS for write endpoints.

## Request Limits

Caddy applies a `32 KB` global request body cap in production. Application-level request-size limits remain authoritative and route-specific.

## Replay and Recovery

Deterministic replay is CLI-only and read-only against the source `DATA_DIR`. It is not exposed through public HTTP routes and must not be wired to Caddy or the public explorer.

For public-alpha recovery, prefer backup -> verify -> restore into a temporary directory -> replay. Do not restore over active producer data unless the producer is stopped and the operator explicitly accepts the destructive `--force` behavior.
