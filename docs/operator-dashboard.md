# Operator Dashboard

The Operator Dashboard is a private, read-only monitoring interface for a Sparge producer node.

It is separate from the public explorer and is disabled by default.

## Security Model

Default config:

```yaml
operatorDashboard:
  enabled: false
  bindLocalOnly: true
```

Environment overrides:

```text
OPERATOR_DASHBOARD_ENABLED=false
OPERATOR_DASHBOARD_LOCAL_ONLY=true
```

When enabled with `bindLocalOnly: true`, the dashboard only accepts loopback requests. Use it through:
- local browser on the node host
- SSH tunnel
- VPN that terminates locally
- another explicit administrative channel

Do not expose `/operator` or `/api/operator/status` publicly.

The Caddy production config blocks:
- `/operator`
- `/operator/*`
- `/api/operator/*`

## Enabling Locally

PowerShell example:

```powershell
$env:OPERATOR_DASHBOARD_ENABLED="true"
$env:OPERATOR_DASHBOARD_LOCAL_ONLY="true"
npm start
```

Open:

```text
http://127.0.0.1:3051/operator
```

Disable by clearing the env vars or setting `enabled: false`.

## Docker

The dashboard is not exposed in the production Caddy stack.

For containerized operator access, use an SSH tunnel or bind a development override to localhost only. Do not publish the dashboard to `0.0.0.0` on an internet-facing host.

## Metrics

The dashboard shows:
- node health, versions, chain ID, uptime
- chain height, latest block, block age, average block time
- mempool count, bytes, and utilization
- invariant/storage/mempool health
- SQLite status, size, and quick integrity status
- observer aggregate health
- HTTP requests/min, validation failures, rate-limit hits, oversized rejects, active requests
- process memory, heap, Node.js version, platform, CPU count
- compact recent structured log event summaries
- last backup time, last backup height, and backup age
- replay remains CLI-only and is not started from the dashboard

It does not expose:
- filesystem paths
- private keys
- secrets
- raw node IDs
- hostnames
- request bodies
- signatures
- raw logs
- backup file paths
- replay report paths or detailed mismatch data

## Safe Actions

The dashboard is read-only.

Available actions:
- Open Explorer
- Copy Diagnostics
- Download Diagnostics Bundle placeholder

It does not include mining, reset, validation bypass, wipe, or chain mutation controls.

## Future Roadmap

- authenticated operator sessions
- downloadable diagnostics bundle
- configurable alert thresholds
- longer historical charts
- external monitoring export
