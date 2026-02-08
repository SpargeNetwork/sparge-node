# FAQ

## Is Sparge production ready?

Not yet. It is an experimental chain intended for testing and iteration.

## Where do keys live?

Dev wallet keys are generated client-side and stored locally in the browser.

## How are rewards split?

See `docs/rewards.md`.

## What does an observer node do?

An observer node is read-only. It syncs from a producer, validates blocks, stores local chain state, and serves explorer data.

## Why can observer show syncing issues?

Common causes are producer URL issues, genesis mismatch, or local observer data from another chain run.
