# Sparge Chain

Sparge Chain is an experimental public-alpha network with a browser wallet, explorer, on-chain participation, and independently validating observer nodes.

The network currently has one official producer. Observers verify and store the chain independently, but they do not create blocks or participate in consensus.

## Start here

- [Getting Started](getting-started.md): use the live network for the first time.
- [Wallet](wallet.md): create, back up, import, and use a browser wallet.
- [Discord Community Identity](community-identity.md): privately link a verified wallet to Discord community roles.
- [Participation and Rewards](protocol.md#participation-and-rewards): understand registration, sponsorship, activity, and maturity.
- [Block Rewards and Pool Payouts](protocol.md#block-reward-distribution): understand emission, the 15/70/10/5 split, payout eligibility, and Treasury fallbacks.
- [Observer Node](observer.md): independently sync and validate Sparge.
- [Builder Guide](developer-guide.md): build an application against the existing network.
- [Public API](rpc.md): review supported public HTTP endpoints.
- [Security](security.md): protect wallet keys and understand Public Alpha risks.
- [FAQ](faq.md): find short answers to common questions.

## Public Alpha

Sparge is not an investment, bank, fiat-backed asset, or promise of value. Public Alpha can include bugs, downtime, migrations, parameter changes, and explicitly announced resets. Do not store value you cannot afford to lose.

## How the network works

The official producer orders valid transactions and creates blocks. Observer nodes fetch those blocks, verify chain identity and state transitions, and provide independent read-only copies of the explorer.

Wallet keys are created and stored locally in your browser. The network receives signed transactions, never your private key.

## What you can do

- Create or import a browser wallet.
- Send and receive SPRG.
- Register as a Participant and maintain activity.
- Sponsor another Participant without gaining control of their wallet or rewards.
- Inspect blocks, transactions, addresses, and network health.
- Run an observer or build an application with the public API.

Documentation for producer operation, chain configuration, backups, replay, releases, and node internals is maintained separately and is not part of the public documentation navigation.
