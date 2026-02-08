# Observer Node

Sparge observer nodes are read-only nodes that sync from a producer and validate blocks locally.

## What Observer Mode Does

- Does not produce blocks
- Does not accept tx submission
- Syncs blocks from configured producer URL
- Verifies chain identity and block continuity
- Serves explorer UI locally

## Run Observer (Source)

1. Set `config/config.yml`:
   - `node.mode: observer`
   - `node.producerUrl: "http://localhost:3051"`
2. Start:
   - `npm start`

## Run Observer (Windows Desktop App)

Build installer:
- `npm run dist:observer:win`

Installer output:
- `release/Sparge Observer Setup 0.1.0.exe`

First run setup asks:
- producer URL
- local observer port

## Data Paths

Observer desktop app stores data in:
- `%APPDATA%\\SpargeObserver\\config.json`
- `%APPDATA%\\SpargeObserver\\data\\state.db`
- `%APPDATA%\\SpargeObserver\\logs\\node.log`

## Common Status Checks

- `GET /api/status`
- Expect:
  - `nodeMode: "observer"`
  - `syncState: "synced"` (or `syncing` / `error`)
  - `syncedHeight`, `producerHeight`, `lagBlocks`

## Troubleshooting

- `producer genesisHash mismatch`:
  - producer and observer are on different chain data
  - reset observer data and re-sync
- `prevHash mismatch`:
  - local observer chain diverged
  - reset observer data and re-sync
- Connection refused:
  - producer URL/port unreachable
