# Contributing

Thanks for your interest in Sparge.

## Quick Rules

- Keep changes small and focused.
- Write deterministic logic; no random or time-dependent behavior in consensus.
- Avoid floats; use micro-units (BigInt) everywhere.
- Prefer tests or a minimal reproduction when changing protocol logic.

## Workflow

1. Open an issue describing the change.
2. Create a branch.
3. Submit a PR with a clear summary and test notes.

Documentation changes should preserve the audience split: public guides under `docs/`, producer procedures in `docs/operator-guide.md`, and maintainer-only material under `docs/internal/`. Add public navigation only through `mkdocs.yml`.

## Code Style

- Node.js + plain JS.
- Avoid large dependencies in core logic.

