# Rewards

## Split per Block

- 15% -> Participants (active)
- 70% -> Node holders (pooled)
- 10% -> Treasury
- 5% -> Eligible holders (pooled)

## Participants

Only active participants receive the 15% share.  
If there are zero active participants, the full participant share goes to the treasury.

## Pools and Accrual Addresses

Node and holder pools accrue to on-chain pool addresses every block:
- `nodePoolAddress`
- `holderPoolAddress`

These are unspendable system addresses used for transparency.

## Fees

All transaction fees go to the treasury.

## Eligible Holders (Average Balance)

Eligibility is based on a **14-day rolling average balance**.  
Minimum average balance: **1,000 SPRG**.

Rewards are proportional to each eligible holder's average balance.

## Payout Cadence

Holder and node-holder pools are paid on payout blocks (14-day cadence in blocks).  
If no eligible recipients exist at payout time, the pool goes to the treasury.

## Remainders

All integer remainders are sent to the treasury.
