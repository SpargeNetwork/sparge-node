# Structured Logging

Sparge producer and observer nodes use one structured logger for operational events. Logs are for observability only; they do not affect consensus, transaction admission, block validation, observer sync, or heartbeat state.

## Configuration

In `config/config.yml`:

```yaml
logging:
  level: info
  format: pretty
  directory: logs
  fileEnabled: true
  consoleEnabled: true
  maxFileSizeBytes: 10485760
  maxFiles: 10
  redactSensitiveFields: true
  logEmptyBlocks: false
```

Supported levels: `debug`, `info`, `warn`, `error`, `fatal`.

Supported formats:
- `json`: one JSON object per line, intended for production ingestion.
- `pretty`: readable local console/file output.

Environment overrides:
- `LOG_LEVEL`
- `LOG_FORMAT`
- `LOG_DIRECTORY`
- `LOG_FILE_ENABLED`
- `LOG_CONSOLE_ENABLED`

`logging.directory` is relative to the node data directory. Path traversal and absolute paths are rejected.

## Files and Rotation

When `fileEnabled` is true, node logs are written to:
- source producer/observer: `<DATA_DIR>/logs/sparge-node.log`
- default source `DATA_DIR`: `server/data`

The logger rotates when `sparge-node.log` reaches `maxFileSizeBytes` and keeps numbered archives up to `maxFiles`.

## Request Correlation

Every `/api` request receives an `X-Request-ID` response header. A safe incoming `X-Request-ID` or `X-Correlation-ID` is reused; malformed values are replaced with a generated ID.

Validation, request-size, rate-limit, transaction admission, and unexpected API errors include the same request ID in logs. Error responses include `requestId` where the request reached the API middleware.

## Privacy and Redaction

Sensitive fields are redacted by default:
- private keys, seeds, mnemonics, passwords, secrets, tokens
- signatures and raw transactions
- request bodies
- hostnames, usernames, computer names
- raw IP addresses and remote addresses
- full internal observer node IDs

Public observer APIs still follow the observer privacy rules: raw IP addresses are not exposed publicly, and public node listing remains opt-in.

## Operational Events

Common event names:
- `node_starting`, `node_started`, `node_shutdown`
- `http_request_completed`, `request_failed`
- `request_body_rejected`, `request_size_rejected`
- `validation_failed`, `rate_limit_triggered`
- `transaction_accepted`, `transaction_rejected`
- `block_mined`, `block_validation_failed`
- `producer_mining_started`, `producer_mining_stopped`, `producer_mining_paused`
- `observer_sync_started`, `observer_sync_progress`, `observer_sync_completed`, `observer_sync_failed`
- `observer_heartbeat_received`
- `invariant_check_failed`, `invariant_check_passed`
- mempool protection events such as `mempool_full_rejected`

Block mining logs contain aggregate metadata such as height, hash prefix, transaction count, duration, mempool remaining count, and invariant status. Full transactions and signatures are not logged.

## Testing

Run:

```powershell
npm run test:logging
```

This checks JSON/pretty output, level filtering, redaction, request IDs, HTTP completion logs, validation/request-size/rate-limit logs, transaction rejection metadata, block mining logs, invariant failure logs, and logger failure isolation.
