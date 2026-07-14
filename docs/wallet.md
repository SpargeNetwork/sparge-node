# Wallet

The Sparge browser wallet creates and signs transactions locally. Private keys stay in browser storage unless you explicitly export them.

## Create a wallet

1. Open **Wallet** in the official Explorer.
2. Choose **Create Wallet**.
3. Read the recovery warning and confirm.
4. Export a wallet backup before receiving funds.

Creating another wallet creates a separate key and address. It does not replace or recover an existing wallet.

## Import a wallet

Use **Import Wallet** and select a trusted Sparge wallet export. Import only on a device and Explorer URL you trust. Never upload wallet files to an issue, support chat, observer, or block explorer form.

## Select and identify wallets

The wallet selector shows locally available wallets by name and shortened address. Shortening is display-only: transactions, links, and copy controls use the complete address or transaction ID.

Give local wallets recognizable names, but always verify the full destination address before sending.

## Receive

The Receive view shows the complete public address. Sharing an address is safe; sharing a private key or wallet export is not.

The displayed balance distinguishes confirmed funds from pending activity. A pending transfer can still fail to confirm and should not be treated as final.

## Send

Enter the destination and amount, then review the confirmation dialog carefully. Check:

- the complete recipient address;
- the amount and fee;
- the selected sending wallet;
- that the Explorer is connected to the expected Sparge network.

After submission, follow the full transaction ID from Wallet Activity. A successful submission means queued, not confirmed.

## Signing confirmation

Every wallet signature requires an explicit confirmation. The wallet has two visually distinct review flows:

- **Signed message**: an off-chain ownership proof or authentication message. The dialog shows the complete human-readable message, selected wallet, purpose, raw message, SHA-256 hash, and confirms that no transaction is broadcast and no SPRG fee is charged.
- **Signed transaction**: an on-chain state change. The dialog shows the transaction type, selected wallet, network, recipient or Participant where applicable, amount, fee, nonce, memo, consequences, canonical message, and transaction hash before **Sign & Broadcast** becomes the final action.

Rejecting or closing either dialog signs nothing. A transaction is never broadcast before confirmation. The private key remains local and is never shown in signing details.

Transfer, self-registration, sponsored registration, unregister, Participant heartbeat, and Discord wallet verification all use this shared confirmation system. Future wallet signing actions must use the same gateway.

## Participation status

The wallet distinguishes these states:

- **Not registered**: no confirmed Participant record exists.
- **Pending**: registration is queued but not yet included in a block.
- **Active**: registered and within the activity window.
- **Inactive**: still registered, but temporarily not eligible for Participant rewards.

Registration, heartbeat, and unregister are signed on-chain transactions. They require confirmation like a transfer.

The optional **Heartbeat Reminder** only warns when activity is close to expiring. It never signs or broadcasts a heartbeat automatically; use **Send Heartbeat** and approve the transaction confirmation yourself.

Participant rewards are only the 15% Participant Pool. Node Pool, Holder Pool, Treasury, emission, and payout-cycle behavior are documented under [Block Rewards and Pool Payouts](protocol.md#block-reward-distribution).

## Reward Maturity

Registered wallets show maturity percentage, stage, multiplier, Registered Height, age, progress to the next stage, remaining blocks, and Active or Inactive eligibility.

Reward Maturity does not apply at block heights 0 through 999. During those first 1,000 blocks, every eligible Active Participant uses the legacy 100% reward multiplier. The maturity stages become effective at block height 1,000.

Participant age still accumulates from the original Registered Height before activation. It does not restart at block 1,000.

Current stages are:

| Participant age | Reward multiplier | Stage |
| ---: | ---: | --- |
| 0-5,100 blocks | 25% | New |
| 5,101-10,200 blocks | 60% | Growing |
| 10,201+ blocks | 100% | Mature |

Inactivity pauses rewards but does not reset maturity. A full unregister removes the record; registering again starts from the New stage.

## Sponsorships

A wallet that sponsors Participants can inspect active and inactive records, available active slots, locked Sponsor Bond, maturity, registration height, and last activity.

The Sponsor pays and signs registration and locks the bond. It does not control the Participant wallet and receives no commission or reward share. The Participant must sign its own future transactions.

The bond returns to the original Sponsor after a successful Participant-initiated unregister. Sponsor reclaim is unavailable in this protocol version. If the Participant loses its key, the bond may remain locked indefinitely.

## Back up and recover

Keep at least one encrypted or physically secured copy of the wallet export outside the browser profile. Test that you can identify the backup without exposing it.

There is no password reset or server-side recovery. Clearing browser storage, replacing a device, or losing the export can permanently remove access.

## Privacy

Addresses, balances, confirmed transactions, participation records, and sponsorship relationships are public chain data. Wallet names and private keys remain local unless you expose them yourself.

## Discord Community Identity

The Community tab can link the selected wallet to a Discord account using a short-lived signed message. The universal message confirmation displays the exact challenge and hash before signing. It never signs automatically, creates no transaction, costs no SPRG, and keeps the private key local. See [Discord Community Identity](community-identity.md).
