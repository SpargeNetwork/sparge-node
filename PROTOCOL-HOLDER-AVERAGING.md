# Holder Rewards: 14-Day Average Balance Eligibility

This document describes how holder rewards are calculated and how eligibility is determined using a rolling average balance window.

## Summary

- Holder rewards are paid out on a **payout block** (not every block).
- Eligibility is based on a **rolling average balance** over the last **14 days** worth of blocks.
- Minimum average balance to be eligible: **1,000 SPRG**.
- Distribution is **proportional** to each eligible holder's average balance.
- Any remainder from integer math goes to the treasury.

## Window Size (Exact, Block-Based)

The window is computed from chain parameters:

```
windowBlocks = floor((14 * 24 * 60 * 60) / blockTimeSeconds)
```

For example, with a 51s block time:

```
windowBlocks ≈ 23,714
```

The window is recomputed from `blockTimeSeconds`, so it stays consistent with protocol timing.

## Eligibility

At payout, each address has an average balance computed over the last `windowBlocks`.

Eligible if:

```
averageBalance >= 1,000 SPRG
```

Only eligible addresses are included in the holder reward split.

## Reward Share

Let `H` be the holder pool for the payout, and `avg_i` the average balance of address `i`.
Let `Total = sum(avg_i)` for all eligible addresses.

Then:

```
reward_i = H * avg_i / Total
```

Integer division is used (micro-units). Any remainder is sent to the treasury.

## Payout Timing

Holder rewards accumulate in a pool and are paid only on payout blocks:

```
height - lastPayoutHeight >= windowBlocks
```

If there are **no eligible holders** at payout time, the full holder pool is sent to the treasury.

## Implementation Notes

- The chain stores a minimal **balance history** per address (height + balance).
- Each balance change appends a new history record at the current height.
- The average over the window is computed deterministically from that history.

## Operational Guidance

For a clean start (full 14-day accuracy from genesis), reset chain data after enabling this feature.  
If not reset, the system still works, but the first window will assume a flat balance before the first recorded change.

