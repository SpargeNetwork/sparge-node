# Request Size Limits

Sparge rejects oversized API request bodies before schema validation or route business logic runs.

## Parsers

The node uses Express JSON parsing only for routes that accept JSON bodies:

- `POST /api/tx`
- `POST /api/network/heartbeat`
- `POST /api/observer/settings`

No global URL-encoded, text, raw, or multipart body parser is enabled for the chain/explorer API.

Middleware order:

1. CORS handling
2. global API `Content-Length` precheck
3. rate limits
4. route-specific JSON parser and route-specific body limit
5. route handlers
6. request-size error handler
7. validation error handler

Before this change, `server/index.js` used one global `express.json()` parser and one special heartbeat parser. Those were replaced by route-specific parsers to avoid stacking parsers incorrectly.

## Limits

Configure limits in `config/config.yml`:

```yaml
security:
  maxJsonBodyBytes: 32768
  maxTransactionBodyBytes: 16384
  maxHeartbeatBodyBytes: 4096
  maxObserverSettingsBodyBytes: 4096
```

Defaults:

- global JSON body precheck: `32768` bytes
- transaction body: `16384` bytes
- observer heartbeat body: `4096` bytes
- observer settings body: `4096` bytes

Environment overrides:

- `MAX_JSON_BODY_BYTES`
- `MAX_TRANSACTION_BODY_BYTES`
- `MAX_HEARTBEAT_BODY_BYTES`
- `MAX_OBSERVER_SETTINGS_BODY_BYTES`

Startup validates that every configured limit is a positive safe integer between `512` bytes and `1048576` bytes. Route-specific limits must be less than or equal to the global limit.

## Responses

Oversized bodies return HTTP `413`:

```json
{
  "error": "PAYLOAD_TOO_LARGE",
  "message": "Request body exceeds the allowed size"
}
```

Unsupported JSON content types return HTTP `415`:

```json
{
  "error": "UNSUPPORTED_MEDIA_TYPE",
  "message": "Content-Type must be application/json"
}
```

Malformed JSON still returns HTTP `400`. Validation errors still return HTTP `400` with `VALIDATION_ERROR`.

## Content Type

JSON body endpoints require `Content-Type: application/json`.

Compressed or encoded request bodies are rejected. The app does not parse arbitrary text as JSON and does not enable a fallback parser for URL-encoded or multipart bodies.

## UTF-8 Field Limits

Schema validation also enforces UTF-8 byte limits for user-controlled strings:

- `memo`: existing 128-character protocol limit plus `128` UTF-8 bytes
- `publicAlias`: `40` characters and `80` UTF-8 bytes
- `version`: `32` characters and `64` UTF-8 bytes
- `nodeId`: bounded format and `128` UTF-8 bytes

Signed transaction fields are never truncated or normalized to fit these limits. Oversized values are rejected before signature verification.

## Logging

Oversized requests are logged with privacy-safe metadata only:

- timestamp
- route
- method
- response status
- configured limit
- declared `Content-Length`, when available
- source IP from Express/socket metadata

Bodies, transaction contents, memos, aliases, signatures, private keys, and sensitive headers are not logged. Oversized-request logs are throttled to avoid flooding.

## Reverse Proxy

Any production reverse proxy should enforce request-body limits equal to or stricter than the app limits.

Examples:

- Nginx: set `client_max_body_size` to `32k` or lower for the API, and stricter route/location limits where applicable.
- Caddy: configure request body limits with the relevant handler/directive for API routes.
- Cloudflare or other edge proxies: set upload/body-size limits at or below the application limits where the plan/product supports it.

Do not configure a proxy with a larger unlimited body size and assume the app alone is the only protection layer.

## Manual Verification

Valid transaction shape still reaches existing transaction validation:

```powershell
npm run tx send --to <spg_address> --amount 1 --fee 0.000001
```

Oversized transaction returns `413`:

```powershell
$body = @{ x = ('a' * 17000) } | ConvertTo-Json -Compress
Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'application/json' -Body $body
```

Oversized heartbeat returns `413`:

```powershell
$body = @{ nodeId = ('obs_' + ('x' * 5000)) } | ConvertTo-Json -Compress
Invoke-WebRequest http://localhost:3051/api/network/heartbeat -Method Post -ContentType 'application/json' -Body $body
```

Unsupported content type returns `415`:

```powershell
Invoke-WebRequest http://localhost:3051/api/tx -Method Post -ContentType 'text/plain' -Body '{}'
```

Standard validation errors still return `400`:

```powershell
Invoke-WebRequest http://localhost:3051/api/block/not-a-height
```
