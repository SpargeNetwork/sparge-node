# Endpoint Rate Limits

Sparge uses layered in-memory rate limits for public `/api` routes.

## Middleware Order

Runtime order in `server/index.js`:

1. CORS
2. global API fallback limiter
3. endpoint/group limiter
4. transaction concurrency limiter, for `POST /api/tx`
5. global `Content-Length` precheck
6. route-specific JSON parser
7. schema validation
8. existing cryptographic, state, storage, and business validation
9. route handler
10. request-size error handler
11. validation error handler

Heartbeat has one additional layer:

1. heartbeat per-IP limiter before parsing
2. JSON parsing and heartbeat schema validation
3. heartbeat per-nodeId limiter after `nodeId` is validated
4. observer registry update

Invalid transaction and heartbeat payloads still consume their per-IP limits. The heartbeat nodeId limiter never trusts raw unvalidated request bodies.

## Defaults

Configure in `config/config.yml`:

```yaml
security:
  trustProxy: false
  rateLimits:
    enabled: true
    global:
      windowSeconds: 60
      maxRequests: 300
    transaction:
      windowSeconds: 60
      maxRequestsPerIp: 10
      maxConcurrentPerIp: 3
    heartbeat:
      windowSeconds: 60
      maxRequestsPerIp: 10
      maxRequestsPerNodeId: 2
    observerSettings:
      windowSeconds: 60
      maxRequestsPerIp: 10
    addressHistory:
      windowSeconds: 60
      maxRequestsPerIp: 30
    blockAndTxLookup:
      windowSeconds: 60
      maxRequestsPerIp: 60
    publicRead:
      windowSeconds: 60
      maxRequestsPerIp: 120
    operator:
      windowSeconds: 60
      maxRequestsPerIp: 5
```

Set `security.rateLimits.enabled: false` only for isolated local test environments. Do not disable rate limiting on a public producer.

Startup rejects invalid rate-limit configuration: non-boolean `enabled`, zero/negative windows, unsafe integers, and absurdly large maxima.

## Route Groups

- Global fallback: all `/api` routes.
- Transaction write: `POST /api/tx`.
- Transaction concurrency: max in-flight `POST /api/tx` requests per effective client IP.
- Heartbeat write: `POST /api/network/heartbeat`, per IP and per validated node ID.
- Observer settings: `POST /api/observer/settings`.
- Public read: `GET /api/status`, `GET /api/genesis`, `GET /api/network/status`, `GET /api/mempool`.
- Block/transaction lookup: `GET /api/block/:height`, `GET /api/tx/:txid`, `GET /api/blocks`, `GET /api/blocks/state`.
- Address/history: `GET /api/balance/:addr`, `GET /api/nonce/:addr`, `GET /api/address/:addr`, `GET /api/address/:addr/txs`.
- Observer listing: `GET /api/network/observers`.
- Operator: `/api/mining/*` and `/api/debug/*`.

Operator routes remain protected by their existing local/dev gates. Rate limiting is not authentication.

## 429 Response

Rate-limited requests return HTTP `429`:

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again later.",
  "retryAfterSeconds": 42
}
```

Responses include:

- `Retry-After`
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

The response does not expose internal limiter keys, raw IPs, node IDs, request bodies, signatures, or stack traces.

## Trust Proxy

Default:

```yaml
security:
  trustProxy: false
```

With the default, Express does not trust `X-Forwarded-For`, so a client cannot bypass limits by spoofing forwarded headers.

If deploying behind a known reverse proxy, configure an exact trusted proxy/hop setting according to Express `trust proxy` semantics. Do not use broad `trustProxy: true` unless the node is only reachable through a controlled proxy path. Trusting arbitrary forwarded headers lets clients choose their apparent IP and bypass per-IP limits.

## In-Memory Store Limits

The current limiter is process-local and in-memory:

- counters reset on producer restart
- counters are not shared across multiple producer instances
- multiple Node workers each keep separate counters
- production scale-out needs Redis, reverse-proxy limits, Cloudflare/Caddy/Nginx limits, or another shared store

Limiter buckets expire by window and are cleaned during traffic. Transaction concurrency counters are released on response `finish` or `close`.

## Logging

Rate-limit logs are throttled and privacy-safe. They include timestamp, method, route, group, status, retry-after, and a generic source marker. They do not log request bodies, memos, signatures, private keys, full node IDs, raw forwarded headers, or raw IP addresses.

## Manual Verification

Repeated transaction submission eventually returns `429`:

```powershell
1..12 | ForEach-Object {
  Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck
}
```

Check `Retry-After`:

```powershell
$r = Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck
$r.StatusCode
$r.Headers['Retry-After']
```

Oversized payload still returns `413` on a fresh window:

```powershell
$body = @{ x = ('a' * 17000) } | ConvertTo-Json -Compress
Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'application/json' -Body $body -SkipHttpErrorCheck
```

Unsupported content type still returns `415`:

```powershell
Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'text/plain' -Body '{}' -SkipHttpErrorCheck
```

Normal validation failures still return `400`:

```powershell
Invoke-WebRequest http://localhost:3051/api/block/not-a-height -SkipHttpErrorCheck
```

Heartbeat spam eventually returns `429`, while normal 60-second observer heartbeats remain under the default limit:

```powershell
$hb = @{
  nodeId = 'obs_manual_test_0001'
  nodeMode = 'observer'
  version = '1.0.0'
  height = 1
  latestHash = ('a' * 64)
  publicListingEnabled = $false
  publicAlias = ''
  countryCode = ''
} | ConvertTo-Json -Compress
1..4 | ForEach-Object {
  Invoke-WebRequest http://localhost:3051/api/network/heartbeat -Method Post -ContentType 'application/json' -Body $hb -SkipHttpErrorCheck
}
```

Spoofed forwarded headers do not bypass limits when `trustProxy` is false:

```powershell
Invoke-WebRequest http://localhost:3051/api/status -Headers @{ 'X-Forwarded-For' = '1.2.3.4' } -SkipHttpErrorCheck
```
