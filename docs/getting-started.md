# Getting Started

This guide explains how to use the existing Sparge public network. You do not need to install Node.js, start a producer, configure genesis, or mine blocks.

## 1. Open the official explorer

Use the official Explorer URL published by Sparge. Check the Network Overview before using the wallet:

- Producer should be online.
- Chain height should be increasing.
- Last block time should be recent.
- Network Health should not show a critical warning.

Avoid wallet links sent through unsolicited messages. Bookmark the verified Explorer URL.

## 2. Open the Wallet

Choose **Wallet** in the Explorer navigation. You can create a new wallet or import an existing wallet backup.

The wallet runs in your browser. Creating a wallet does not create an account with Sparge and does not send your private key to the network.

## 3. Back up before receiving funds

Export the wallet backup and store it somewhere private and durable. Anyone with that backup can control the wallet. Sparge cannot reset a password, replace a lost private key, or recover a wallet after browser data is removed.

Do not share a private key or wallet export with support, a Sponsor, an observer operator, or another participant.

## 4. Receive SPRG

Select **Receive** and share only the public address beginning with `spg_`. Confirm the complete address when transferring meaningful amounts.

Incoming transactions first appear as pending and become confirmed after inclusion in a block.

## 5. Send SPRG

Select **Send**, enter the recipient address and amount, review the fee and complete address, then confirm. The wallet signs locally and submits the signed transaction.

A queued transaction is not yet confirmed. Use Wallet Activity or the transaction page to follow it until it appears in a block.

## 6. Participate, optionally

Participation is optional. Registration requires a Sponsor, a bond, and a transaction fee. You can sponsor yourself or another wallet. Sponsorship does not transfer wallet control and gives the Sponsor no share of Participant rewards.

Read [Participation and Rewards](protocol.md#participation-and-rewards) before registering. In particular, understand activity requirements, reward maturity, unregister behavior, and the current lost-key limitation.

## Next steps

- Learn the complete browser flow in the [Wallet guide](wallet.md).
- Read the [FAQ](faq.md).
- Independently validate the network with an [Observer Node](observer.md).
- Integrate an application using the [Builder Guide](developer-guide.md).
