# Participation

## Participant Registration

`register_participant` is an on-chain transaction:

- `from` = sponsor (signer / fee payer / nonce owner)
- `participant` = address being registered
- Sponsor locks the bond

### Genesis Operator (patient 0)

There is a one-time free registration window for the genesis operator:
- `tx.from` must equal `genesisOperatorAddress`
- `participant` must equal `from`
- height < `genesisFreeBlocks`
- only once; after use, bond is required
- fee can be 0 during the free window

## Bond

Bond is locked collateral and is refundable on unregister.

## Active Window

Participants are **active** if their `lastSeenHeight` is within the active window.
Any tx sent **from** a participant updates `lastSeenHeight`.

## Unregister

`unregister_participant` removes the participant and releases the bond to the sponsor.
