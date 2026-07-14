# Security

Sparge is Public Alpha software. This page focuses on the security decisions users, Participants, observer operators, and application builders need to make.

## Protect your wallet

- Use only the verified Sparge Explorer URL.
- Back up a new wallet before receiving funds.
- Keep wallet exports and private keys secret.
- Never send private material to support, a Sponsor, or an observer operator.
- Verify the complete destination address, amount, fee, and selected wallet before signing.
- Treat unexpected wallet-import requests as suspicious.

Anyone with the private key can control the wallet. Sparge cannot reverse a signed transfer or recover a lost key.

## Understand browser storage

Browser wallets store keys locally. Clearing site data, replacing a browser profile, device loss, malware, or disk failure can remove access. A producer database backup does not contain or recover user wallet keys.

Keep a protected wallet export outside the browser. Do not store an unencrypted export in cloud sharing, public source control, chat, screenshots, or issue attachments.

## Verify before trusting

Public Alpha may have downtime, bugs, migrations, or explicitly announced resets. Check network health and transaction confirmation in the Explorer. A Pending or queued transaction is not final.

Builders should verify chain ID, genesis hash, protocol version, and economics version before signing or submitting transactions.

## Participation risks

Sponsorship does not give a Sponsor control over a Participant, but it locks the Sponsor Bond. Only the Participant can currently unregister. If the Participant loses its private key, the bond may remain locked indefinitely because Sponsor reclaim is unavailable.

Reward Maturity and displayed estimates are protocol state, not guaranteed income or value. Participation does not establish a legal identity or prove that separate wallets belong to separate people.

## Observer privacy

Observer public listing is opt-in. Aggregate network counts can include private observers. Public listings omit raw IP addresses, hostnames, usernames, internal node IDs, machine metadata, and latest block hashes.

Running any internet-connected service still exposes network information to infrastructure providers and the upstream producer. Use an appropriate network and host security model.

## Discord linking

Discord OAuth and wallet ownership proof are separate steps. Verify the chain, domain, Discord account, and complete wallet address in the displayed challenge before signing. Linking costs no SPRG and never requires a blockchain transaction or private-key upload.

Community profiles are private by default. Discord names, badges, status, wallet verification, and balances remain hidden until separately enabled.

## API safety for builders

- Never collect or transmit private keys.
- Preserve canonical signed fields exactly.
- Use integer strings for protocol amounts.
- Keep complete transaction IDs in routes and requests.
- Respect pagination, request limits, `Retry-After`, and temporary errors.
- Avoid logging complete signed requests, signatures, memos, or sensitive user metadata.

## Network limitations

The current network has one official producer. Observers independently validate state, but they do not provide decentralized producer liveness, censorship resistance, fork choice, or finality.

Sparge is not represented as formally verified or independently audited. Do not treat Public Alpha testing as proof of economic or security safety.

## Report a vulnerability

Follow the repository [Security Policy](../SECURITY.md) and report vulnerabilities privately. Do not include private keys, live exploit secrets, complete signatures, or sensitive production data in a public issue.
