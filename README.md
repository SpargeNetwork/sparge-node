# Sparge Chain

Sparge Chain is experimental public-alpha blockchain software. It is not an investment or financial guarantee. The current network uses one official producer; read-only observer nodes independently synchronize and validate its chain state.

## Quick start

```powershell
npm install
npm start
```

Open `http://localhost:3051` or query `http://localhost:3051/api/status`.

For isolated local block production, enable development administration before startup, then use the mining scripts:

```powershell
$env:DEV_ENABLE_ADMIN="true"
npm start
npm run mine:start
npm run mine:status
npm run mine:stop
```

Never enable these controls on an internet-facing node.

## Wallet

```powershell
npm run wallet create
npm run wallet show
npm run tx send --to <spg_address> --amount 1 --fee 0.000001
```

Signing happens locally. Private keys are not sent to nodes. See the [Wallet Guide](docs/wallet.md).

## Observer

Set `node.mode: observer` and `node.producerUrl` in `config/config.yml`, use a separate data directory, and run `npm start`. An observer validates and serves explorer data but rejects transaction submission.

Windows installer build:

```powershell
npm run dist:observer:win
```

See the [Observer Node Guide](docs/observer.md) for synchronization, desktop paths, heartbeat privacy, and troubleshooting.

## Docker

```powershell
docker compose up -d --build
docker compose ps
```

The local stack exposes producer `3051` and observer `3052` with separate persistent volumes. Public HTTPS deployment uses `docker-compose.production.yml` and Caddy; maintainers must follow the internal [Operator Guide](docs/internal/operator-guide.md) before deployment.

## Documentation

- [Documentation Home](docs/index.md)
- [Getting Started](docs/getting-started.md)
- [Protocol Guide](docs/protocol.md)
- [Builder Guide](docs/developer-guide.md)
- [Public API](docs/rpc.md)
- [Security](docs/security.md)
- [Discord Community Identity](docs/community-identity.md)

Maintainer-only documentation:

- [Internal Documentation Index](docs/internal/index.md)
- [Node Development Guide](docs/internal/node-development.md)
- [Operator Guide](docs/internal/operator-guide.md)
- [Configuration Reference](docs/internal/configuration.md)
- [Discord Identity Operations](docs/internal/discord-community-identity.md)

Maintainer release and review material lives under `docs/internal/` and is intentionally absent from public MkDocs navigation.

## Development evidence

Focused suites cover stability, recovery, participant maturation and UI documentation, economics, validation, request size, rate limits, mempool, runtime invariants, logging, observer network, dashboard, backup, and replay. The dedicated protocol correctness suite remains missing and must not be represented as covered by another test.

Maintainer-only release evidence procedures are kept under `docs/internal/` and excluded from public navigation.

## Core formats

- Address: `spg_` + `base58(sha256(publicKeyBytes)[0..20])`
- Public key: raw Ed25519 key, 32 bytes / 64 lowercase hex characters
- Canonical transaction message: `type|chainId|from|to|amountMicro|feeMicro|nonce|publicKeyHex|sponsor|participant|memo?`
- Transaction ID: SHA-256 of canonical UTF-8 message bytes, excluding the signature
