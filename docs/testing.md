# Testing

## Smoke Test

Open:

```
/smoke-test.html
```

It will create two browser wallets, attempt registration, and validate liveness.

## Invariants (Dev Only)

Enable with:

```
DEBUG_INVARIANTS=true
```

Then call:

```
GET /api/debug/invariants
```

