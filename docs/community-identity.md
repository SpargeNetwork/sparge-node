# Discord Community Identity

Community Identity lets you connect one Discord account to one primary Sparge wallet and receive community roles based on verifiable network state.

The wallet remains the cryptographic identity. Discord is only the community account connected to it. The link is off-chain and does not change balances, participation, rewards, transactions, or consensus.

## Link Discord

1. Open **Wallet** in the official Sparge Explorer.
2. Select the wallet you want to verify.
3. Open **Community** and choose **Link Discord**.
4. Authenticate on Discord and return to Sparge.
5. Create a Verification Message.
6. Read the complete message and confirm the Discord account, chain, domain, and wallet address.
7. Choose **Sign Verification Message**.
8. Review the universal **Sign Message** confirmation, including the complete challenge, wallet, purpose, raw message, hash, and zero-fee statement.
9. Explicitly choose **Sign Message**.

The wallet never signs automatically. Linking does not create a blockchain transaction and costs no SPRG.

The private key remains in the browser wallet. Never paste a private key or wallet export into Discord, the Explorer, or a support conversation.

The Observer desktop app provides **Open Identity Page** and delegates the complete flow to the secure browser page. OAuth and wallet signing are not duplicated inside Electron.

## What verification proves

A successful link proves that the same browser session:

- authenticated the immutable Discord user ID through Discord OAuth;
- controlled the private key for the selected Sparge address at verification time;
- signed the exact short-lived challenge created for that Discord account, wallet, chain, and Sparge domain.

The challenge is single-use and expires after ten minutes by default.

## What it does not prove

Wallet verification does not prove a legal identity, unique person, account reputation, wallet balance, observer ownership, or entitlement to future rewards. It does not give Discord, a Sponsor, or Sparge control over the wallet.

## Automatic roles

The initial automatic roles are objective:

| Role | Requirement |
| --- | --- |
| Verified Wallet | A current valid Discord-wallet link. |
| Active Participant | The linked wallet is a currently Active Participant. |
| Mature Participant | The linked wallet is Active and has 100% Reward Maturity. |

Roles are synchronized after linking, manually on request, and periodically. Temporary Discord or node errors delay synchronization instead of changing chain state.

Builder, Early Alpha, Observer Operator, and Public Observer are not inferred from transaction activity or an unsupported claim. They remain manual until Sparge has an objective registry or secure observer ownership proof.

## Badges

Badges are profile representations of verified or explicitly manual roles. Clients cannot submit their own badges. A badge appears publicly only when both the public profile and public badges settings are enabled.

## Privacy

Linking is private by default. The public profile, Discord display name, badges, verified-wallet marker, Participant status, Observer status, and balance each have separate controls.

Balance visibility is off by default. Public profile visibility can be revoked without unlinking Discord.

Public profile responses never expose OAuth tokens, Discord user IDs, internal identity IDs, session data, wallet keys, signatures, or role-sync errors.

## Synchronize roles

Use **Sync Roles** when a Participant or maturity state has recently changed. Repeated synchronization is safe and does not remove unrelated Discord roles.

If Discord is unavailable, wait and retry later. Existing Discord roles are not evidence of current chain eligibility; the Explorer remains the source for chain state.

## Unlink

Choose **Unlink** and confirm the destructive action. Unlinking:

- removes only Sparge-managed automatic Discord roles;
- disables the public community profile;
- keeps unrelated Discord roles;
- does not modify the wallet or blockchain.

Relinking, including linking another wallet, requires a fresh Discord session and a new wallet challenge.

## Troubleshooting

**Join the server first** means the authenticated Discord account is not currently a member of the configured Sparge Discord server.

**Challenge expired** means more than the configured challenge lifetime passed. Create and sign a new message.

**Selected wallet changed** means the wallet selector no longer matches the generated challenge. Create a new challenge for the newly selected wallet.

**Wallet already linked** means another Discord account already owns the current off-chain link. A wallet cannot silently replace another account.

**Role sync delayed** usually means Discord or the local chain-state read was temporarily unavailable. No blockchain state was changed.
