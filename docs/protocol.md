# How Sparge Works

This page explains the current Public Alpha network. It describes the existing Sparge chain; it is not a guide for creating another chain.

## Network model

Sparge currently uses one official producer. The producer orders accepted transactions and creates blocks. Observer nodes independently download, verify, and store those blocks, but they do not produce blocks, select producers, or participate in consensus.

This design provides independent validation, not decentralized producer liveness, censorship resistance, fork choice, or finality. Observer heartbeats report network health only and cannot change chain state or consensus.

## Blocks and confirmation

Transactions enter a process-local mempool before a producer includes them in a block. A response saying `queued` or a wallet state saying Pending is not confirmation.

Each block commits to its previous block, transactions, chain identity, and deterministic state root. Explorer transaction pages use the complete 64-character transaction ID.

Pending transactions can disappear after a producer restart and may need to be submitted again. Confirmed transactions remain in chain history.

## Addresses and keys

Sparge wallets use Ed25519 keys. Public addresses begin with `spg_`. Private keys authorize transactions and must never be sent to a node, Explorer, Sponsor, or support channel.

Addresses, balances, transactions, participation records, and sponsorship relationships are public. A wallet name is only a local browser label.

## Transaction types

Users can submit:

- `transfer`: move SPRG to another address;
- `register_participant`: register a Participant and lock a Sponsor Bond;
- `heartbeat`: refresh on-chain Participant activity;
- `unregister_participant`: remove a Participant and release its bond.

The browser wallet creates and signs these transactions locally. Fees go to treasury. Exact signed fields and endpoint contracts are documented in the [Public API](rpc.md).

## Participation and rewards

Participation is an optional on-chain role. A registered Participant can receive a share of the Participant reward pool while active. Registration does not grant block-production rights.

### Sponsor and Participant

A **Sponsor** signs and pays the registration transaction and locks the Sponsor Bond. The **Participant** is the registered wallet that receives Participant rewards and maintains its own activity.

You may sponsor yourself. In that case the same wallet is Sponsor and Participant.

When sponsoring another wallet:

- the Sponsor pays registration costs and locks the bond;
- the Participant retains sole control of its private key;
- rewards belong entirely to the Participant;
- the Participant signs its own heartbeats and unregister transaction;
- the Sponsor cannot transact or unregister on behalf of the Participant.

Sponsorship is not a referral, delegation, commission, or revenue-sharing system. A Sponsor receives no commission or reward share.

### Sponsor capacity and bond

A Sponsor can have up to 10 active Sponsored Participants. Inactive records remain visible but do not consume an active slot.

The configured bond is `50,000,000` base units. With the current nine token decimals, the Explorer displays this as **0.05 SPRG**. It must not be described as 50 SPRG unless a future explicit economics migration changes the configured amount.

The bond is locked rather than burned. A successful Participant-initiated unregister returns it to the original Sponsor. Sponsor reclaim is unavailable in this protocol version. If a Participant loses its private key, its bond may remain locked indefinitely.

### Activity

A Participant stays active when qualifying on-chain activity updates its Last Seen Height within the 5,100-block activity window, approximately three days at the current target block time.

An inactive Participant remains registered but does not receive Participant rewards. A later valid transaction from that Participant can reactivate it.

Inactivity pauses rewards but does not reset Reward Maturity. Unregistering removes the registration; registering again creates a new Registered Height and starts maturity again.

### Reward Maturity

Reward Maturity gradually raises a Participant's share according to the age of the current registration:

#### Activation at block 1,000

Reward Maturity is **not applied at block heights 0 through 999**. During those first 1,000 blocks, every eligible Active Participant receives the legacy 100% multiplier, regardless of registration age.

The maturity rules activate at **block height 1,000**. From that block onward, each Participant receives the multiplier that matches the age of its current registration.

Registration age still accumulates before activation. It is calculated from the original Registered Height and does not restart at block 1,000. For example, a Participant registered at block 200 has an age of 800 blocks when maturity activates at block 1,000 and therefore enters the New stage at 25%.

| Age in blocks | Multiplier | Stage |
| ---: | ---: | --- |
| 0 through 5,100 | 25% | New |
| 5,101 through 10,200 | 60% | Growing |
| More than 10,200 | 100% | Mature |

Maturity is based on Registered Height, not timestamps or observer heartbeats. The activation boundary changes only the applied reward multiplier; it does not change registration records or their age.

If an equal base share is 10 SPRG, a New Participant receives 2.5 SPRG, a Growing Participant 6 SPRG, and a Mature Participant 10 SPRG. Integer calculations round down in base units; deterministic remainder goes to treasury.

### Reward calculation

For Participant pool `P`, active Participant count `N`, and maturity multiplier `M` in basis points:

```text
baseShare = floor(P / N)
participantReward = floor(baseShare * M / 10000)
treasuryRemainder = P - sum(participantReward)
```

This calculation uses integers and conserves the complete pool.

## Block reward distribution

### Emission and changing block rewards

Sparge has no fixed reward amount per block and currently has no maximum supply. Each block calculates newly minted base units from the total supply before that block, the current annualized emission rate, and the configured target number of blocks per year:

```text
newMintAccumulator += totalSupply * emissionRatePpm
mintedBaseUnits = floor(newMintAccumulator / (1,000,000 * blocksPerYear))
```

The remainder stays in the deterministic mint accumulator instead of being discarded. This avoids losing fractions smaller than one base unit.

The annualized emission rate starts at 5% (`50,000` parts per million), declines linearly by block to 2% (`20,000` parts per million) over the first four target years, and remains at 2% afterward. During the decline, the lower rate generally reduces the absolute block reward. Once the rate remains at 2%, the absolute reward can slowly increase because it is calculated over a growing supply.

The Explorer's **Emission Rate** is this annualized percentage. It is not the percentage assigned to one recipient.

### Per-block allocation

Every block divides its newly minted amount as follows:

| Destination | Share | Behavior |
| --- | ---: | --- |
| Active Participants | 15% | Paid every block in equal base shares adjusted by Reward Maturity. |
| Node Pool | 70% | Accumulates until the block-based reward payout. |
| Treasury | 10% | Credited every block, in addition to fees and specified remainders. |
| Holder Pool | 5% | Accumulates until the block-based reward payout. |

All calculations use integer base units and round down. Any remainder from splitting the newly minted amount goes to Treasury. Participant rewards below their 15% pool because of maturity, integer division, or a lack of Active Participants also go to Treasury.

For example, if a block mints exactly 1,000 SPRG before integer rounding:

| Destination | Amount |
| --- | ---: |
| Participant Pool | 150 SPRG |
| Node Pool accrual | 700 SPRG |
| Treasury base allocation | 100 SPRG |
| Holder Pool accrual | 50 SPRG |

The Node and Holder amounts are accruals, not payouts to every node or holder in that block.

### Reward payout cycle

Node and Holder Pool payouts are triggered by block height, not wall-clock time. With the current 51-second target block time, the payout window is `23,717` blocks, approximately 14 days. A slower or faster real production schedule changes the elapsed wall-clock time but not the required block count.

At the payout block:

1. That block first adds its 70% Node Pool and 5% Holder Pool accruals.
2. The complete accumulated balances of both pools are processed, including the payout block's accruals.
3. Eligible rewards are calculated proportionally in integer base units.
4. Each pool is set to zero after processing.
5. Integer leftovers, or a complete pool without eligible recipients, go to Treasury.

Pool balances do not roll into another cycle after a payout.

### Node Pool

The Node Pool is distributed proportionally over positive stake recorded in the protocol ledger:

```text
nodeReward = floor(nodePool * addressStake / totalRecordedStake)
```

Integer leftovers go to Treasury. If there is no positive recorded stake at payout time, the complete Node Pool goes to Treasury.

**Public Alpha limitation:** the current public transaction set has no supported `stake` transaction and the browser wallet has no public node-staking flow. Running an observer does not create stake and does not automatically earn Node Pool rewards. The Node Pool must not be described as an observer reward until a future explicit protocol mechanism defines eligibility and ownership proof.

### Holder Pool

Holder eligibility uses the average confirmed balance over the current payout window. A wallet is eligible when:

- its average balance is at least 1,000 SPRG;
- it is not the Producer, Treasury, Node Pool, or Holder Pool system address.

Rewards are proportional to eligible average balances:

```text
holderReward = floor(holderPool * walletAverageBalance / totalEligibleAverageBalance)
```

This is not an equal payment per wallet. A wallet averaging 2,000 SPRG receives twice the share of a wallet averaging 1,000 SPRG, assuming both remain eligible. Moving funds into a wallet shortly before payout affects only part of its block-weighted average.

Integer leftovers go to Treasury. If no wallet meets the threshold at payout time, the complete Holder Pool goes to Treasury. The processed Holder Pool is then zero, regardless of whether holders or Treasury received it.

### Treasury receipts

Treasury can receive more than the displayed base 10% because it also receives:

- transaction fees;
- per-block allocation rounding remainders;
- unused Participant Pool amounts caused by maturity or integer division;
- the full Participant Pool when there are no Active Participants;
- Node and Holder payout rounding leftovers;
- the complete Node or Holder Pool when that pool has no eligible recipients.

These transfers conserve the complete minted amount; they do not mint additional SPRG beyond the block's recorded total.

### Reading the Explorer

The two pending pool values are separate:

- **Node Pool - Accumulated** is the pending 70% allocation.
- **Holder Pool - Accumulated** is the pending 5% allocation.

The Node Pool is normally about 14 times the Holder Pool because `70 / 5 = 14`. **Total New Tokens** on a block is the complete minted amount; **Participant Rewards** is only the portion of the 15% Participant Pool actually paid to Active Participants in that block.

Explorer reward values are informational representations of on-chain block and state data. Eligibility and payout results are determined by protocol validation, not by the browser display.

## Current limitations

- One official producer controls ordering and block availability.
- Sponsor reclaim and Participant co-signing during sponsored registration are unavailable.
- Participation does not identify people or prevent one person from controlling multiple wallets.
- Economics and protocol behavior can still change during Public Alpha.
- The implementation has test coverage and deterministic replay tooling but is not formally verified or represented as independently audited.
