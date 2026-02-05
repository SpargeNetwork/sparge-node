# Ops / Runbook

## Start

```
npm start
```

## Mining

```
POST /api/mining/start
POST /api/mining/stop
```

## Data Reset

Remove chain data and restart:

- `server/data/genesis.json`
- `server/data/state.db`

## Config

Main config file: `config/config.yml`
