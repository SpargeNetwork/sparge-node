# Frequently Asked Questions

## Is Sparge production ready?

No. Sparge is experimental Public Alpha software. Bugs, downtime, migrations, parameter changes, and explicitly announced resets remain possible.

## Is SPRG an investment or guaranteed store of value?

No. Sparge makes no promise of value, liquidity, uptime, permanence, exchange listing, or future direction.

## Do I need to install software to use Sparge?

No. Regular users can use the browser wallet and Explorer on the existing network. Installation is optional for people running an observer.

## Where is my wallet stored?

Browser wallet keys are stored locally in your browser. Sparge does not hold a recoverable server-side account for you.

## Can Sparge recover a lost wallet?

No. Restore from your own wallet export. Without the private key or a valid backup, the wallet cannot be recovered.

## Is a queued transaction confirmed?

No. Queued or Pending means accepted for possible inclusion. It is confirmed only after appearing in a block.

## Why did a pending transaction disappear?

Pending transactions are kept in the producer's process-local mempool. A restart or later validation failure can remove one. Check the full transaction ID and confirmed address history before resubmitting.

## What is a Participant?

A Participant is a registered address that can receive a share of the Participant reward pool while active. Participants do not produce blocks.

## What is a Sponsor?

A Sponsor signs and pays `register_participant` and locks the Sponsor Bond. It gains no control over the Participant and receives no commission or reward share.

## Can I sponsor myself?

Yes. The same wallet then pays registration, locks its own bond, controls the Participant key, and receives its own Participant rewards.

## Does a Sponsor receive part of Participant rewards?

No. Rewards belong to the Participant address. Sponsorship is not referral commission, delegation, or revenue sharing.

## When is the Sponsor Bond returned?

The bond returns to the original Sponsor after the Participant successfully unregisters. Inactivity alone does not release it.

## Can a Sponsor unregister a Participant?

No. Only the Participant can currently unregister. Sponsor reclaim is unavailable in this protocol version.

## What happens if a Participant loses its wallet?

It can no longer sign heartbeats or unregister. Rewards eventually pause through inactivity, while the Sponsor Bond may remain locked indefinitely.

## Why is my Participant status Pending?

Registration has been submitted but not yet included in a block. It becomes Active only after confirmation and successful state application.

## Why is my Participant Inactive?

The Participant has not sent qualifying on-chain activity within the current activity window. It remains registered but does not receive Participant rewards until reactivated.

## Does inactivity reset Reward Maturity?

No. Inactivity pauses rewards but does not reset maturity. Unregistering and registering again does restart maturity.

## Why do new Participants receive reduced rewards?

Reward Maturity gradually increases the Participant share from 25% to 60% and then 100% based on registration age. This encourages stable participation but does not identify people or prevent multiple wallets.

## Does Reward Maturity apply during the first 1,000 blocks?

No. At block heights 0 through 999, every eligible Active Participant uses the legacy 100% multiplier. Reward Maturity activates at block height 1,000.

Registration age still accumulates before activation. At block 1,000, the multiplier is selected using the Participant's original Registered Height; age does not restart from zero.

## What does an observer do?

An observer independently synchronizes, verifies, and stores chain state and serves a read-only Explorer. It does not create blocks or accept transactions.

## Is observer listing private?

Public listing is opt-in. Aggregate health can include private observers, while public responses omit raw IPs, internal IDs, hostnames, machine metadata, and latest hashes.

## How are rewards divided?

Each block assigns 15% to the Participant Pool, 70% to the Node Pool, 10% to Treasury, and 5% to the Holder Pool. See [Block reward distribution](protocol.md#block-reward-distribution), [Reward payout cycle](protocol.md#reward-payout-cycle), and [Reward Maturity](protocol.md#reward-maturity).

## Why does the block reward change?

The reward is calculated from the current supply and annualized emission rate instead of being a fixed amount. The rate declines from 5% to 2% over the first four target years. Integer base-unit accumulation can also create tiny differences between adjacent blocks. See [Emission and changing block rewards](protocol.md#emission-and-changing-block-rewards).

## What is the difference between accumulated Node and Holder rewards?

They are separate pending pools. The Node Pool receives 70% of each block's minting and the Holder Pool receives 5%, so the Node Pool is normally about 14 times larger. Neither displayed amount is the combined total.

## Is the complete Holder Pool paid at the next payout?

The complete pool is processed, including the payout block's accrual. Eligible holders receive proportional rewards based on their average balance over the block window. Integer leftovers go to Treasury. If there are no eligible holders, the complete pool goes to Treasury instead of rolling into the next cycle.

## Does running an observer earn Node Pool rewards?

No. Observers independently validate the chain but do not currently receive protocol rewards. Node Pool distribution uses recorded protocol stake, and Public Alpha currently has no public stake transaction or browser-wallet staking flow.

## Can I build an application on Sparge?

Yes. Start with the [Builder Guide](developer-guide.md) and [Public API](rpc.md). Public Alpha integrations should verify chain and protocol versions.

## Does linking Discord create a transaction or fee?

No. The wallet signs a short-lived off-chain verification message. It does not submit a transaction and costs no SPRG. The private key never leaves the browser.

## Are my Discord account and badges public after linking?

No. Community Identity is private by default. Every public profile field must be enabled explicitly, and balance visibility has its own disabled-by-default setting.

## Where are producer and node-development documents?

They are intentionally excluded from the public documentation navigation and maintained separately under `docs/internal/` in the source repository.
