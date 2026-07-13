# HTTPS with Caddy

This deployment exposes the public Sparge explorer and API through Caddy while keeping the producer and observer application ports off the public host.

## Architecture

```text
Internet
  |
  v
Caddy :80 / :443
  |
  v
producer:3051 on the internal Docker network
```

The production Compose file uses the producer as the public upstream because the producer serves the explorer and API. The observer remains internal and syncs from `http://producer:3051`.

Local development still uses `docker-compose.yml` and publishes `3051` and `3052`. Production HTTPS uses `docker-compose.production.yml`.

## DNS and Firewall

Before starting production Compose:
- choose a real hostname, for example `explorer.your-domain.example`
- point DNS `A`/`AAAA` records to the server
- open inbound TCP ports `80` and `443`
- do not rely on public certificate issuance for `localhost`

Caddy automatic HTTPS requires a real reachable hostname.

## Environment

Set:

```text
SPARGE_DOMAIN=explorer.your-domain.example
```

Production Compose sets the node environment:

```text
SECURITY_TRUST_PROXY=1
CORS_ALLOW_ORIGINS=https://${SPARGE_DOMAIN}
LOG_FORMAT=json
LOG_CONSOLE_ENABLED=true
LOG_FILE_ENABLED=false
```

`SECURITY_TRUST_PROXY=1` tells Express to trust exactly one proxy hop. Do not set `security.trustProxy: true` for internet-facing deployments.

## Startup

```powershell
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
```

Check:

```powershell
Invoke-RestMethod https://$env:SPARGE_DOMAIN/api/status
```

## TLS Behavior

Caddy manages certificates automatically and stores ACME state in the `caddy-data` named volume. Back up this volume with the chain data volumes before host migration.

HTTP requests are redirected to HTTPS. HSTS is enabled only on the HTTPS site with:

```text
Strict-Transport-Security: max-age=31536000
```

`includeSubDomains` and `preload` are intentionally not set.

## CORS

The explorer and API are same-origin in production:

```text
https://your-domain.example
https://your-domain.example/api/status
```

This does not need wildcard CORS. If browser clients from another origin are required, set `CORS_ALLOW_ORIGINS` to the exact allowed origin list. Do not use wildcard CORS for write endpoints.

Local development origins remain configured in `config/config.yml`.

## Security Headers

The Caddyfile sets:
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`
- removes the `Server` response header

The frontend currently uses external static scripts and styles, so CSP does not require `unsafe-inline`.

## Request Limits and Timeouts

Caddy applies a global request body cap:

```text
request_body max_size 32KB
```

The application still enforces stricter route limits:
- transaction body: `16 KB`
- heartbeat body: `4 KB`
- observer settings body: `4 KB`

Caddy upstream timeouts are conservative:
- dial timeout: `5s`
- response header timeout: `15s`

## Operator Routes

Caddy blocks:
- `/operator`
- `/operator/*`
- `/api/operator/*`
- `POST /api/mining/start`
- `POST /api/mining/stop`
- `/api/debug/*`

This is in addition to application-level protections. `GET /api/mining/status` remains reachable if the producer route is mounted; it exposes mining state only, not operator control.

## Logs

Caddy access logs go to stdout in structured JSON. They are separate from Sparge application logs.
Authorization, Cookie, and Set-Cookie headers are removed from Caddy access logs.

Use:

```powershell
docker compose -f docker-compose.production.yml logs -f caddy
docker compose -f docker-compose.production.yml logs -f producer
```

Request bodies are not logged. Avoid sensitive values in query strings because normal proxy access logs include request URIs.

## Health Checks

Production checks:
- Caddy config validates in the Caddy container health check.
- Producer and observer use `/api/status` health checks.
- Public `/api/status` should work through HTTPS.
- Observer health does not require full sync, but `syncState=error` is unhealthy.

Manual checks:

```powershell
curl -I http://$env:SPARGE_DOMAIN/
curl -I https://$env:SPARGE_DOMAIN/
curl https://$env:SPARGE_DOMAIN/api/status
```

Expected:
- HTTP redirects to HTTPS
- HTTPS has security headers
- `X-Request-ID` appears on API responses
- oversized API bodies still return `413`
- unsupported content types still return `415`
- rate-limited requests still return `429`

## Safe Shutdown

```powershell
docker compose -f docker-compose.production.yml stop
```

Compose sends `SIGTERM`. The Node process handles graceful shutdown and Caddy stops normally. Named volumes are preserved.

## Upgrades

1. Back up `sparge-producer-data`, `sparge-observer-data`, `caddy-data`, and `caddy-config`.
2. Build or pull the new images.
3. Stop services gracefully.
4. Start the new stack with the same volumes.
5. Verify HTTPS, `/api/status`, height, `genesisHash`, health, and observer sync.
6. Roll back to the previous image if startup audit fails.

## Troubleshooting

- Certificate does not issue: verify DNS, ports `80/443`, and public reachability.
- Caddy starts but upstream fails: check `docker compose -f docker-compose.production.yml ps` and producer health.
- Rate limits see the proxy IP: verify `SECURITY_TRUST_PROXY=1` and that producer is not publicly exposed.
- CSP blocks assets: check browser console and verify assets are served from the same origin.
- Public ports expose producer/observer: use production Compose only and inspect `docker compose -f docker-compose.production.yml ps`.

## Manual Deployment Checklist

1. Configure a real domain.
2. Point DNS to the server.
3. Open ports `80` and `443`.
4. Set `SPARGE_DOMAIN`.
5. Run:
   ```powershell
   docker compose -f docker-compose.production.yml up -d --build
   ```
6. Confirm certificate issuance.
7. Verify HTTP to HTTPS redirect.
8. Verify explorer and `/api/status`.
9. Verify security headers.
10. Verify client-IP rate limiting through Caddy.
11. Verify producer/observer app ports are not publicly exposed.
12. Verify observer sync.
13. Verify Caddy and app logs.
14. Verify graceful shutdown.
