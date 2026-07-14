# Discord Community Identity Operations

This runbook is internal. It covers the official off-chain identity service and Discord bot, not public wallet usage.

## Security boundary

Community Identity is isolated under `server/community/` and `/api/community/`. It uses the producer's SQLite file for separate identity tables but never writes block, ledger, transaction, participant, observer, or consensus state.

Keep `communityIdentity.enabled: false` until the Discord application, callback, bot hierarchy, HTTPS origin, secrets, and role IDs are ready.

## Discord application

1. Create an application in the Discord Developer Portal.
2. Create its bot user and add that bot to the official Sparge guild.
3. Configure the exact HTTPS callback used by `DISCORD_OAUTH_REDIRECT_URI`.
4. Use the OAuth2 authorization-code flow with only the `identify` scope.
5. Do not enable automatic guild joining; users must already belong to the configured guild.

Discord recommends validating OAuth `state`. Sparge stores a random, single-use state server-side, expires it, and rotates the session after successful OAuth.

Official references:

- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)
- [Discord OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Discord Guild Resource](https://docs.discord.com/developers/resources/guild)
- [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits)

## Bot permissions and hierarchy

Grant only the guild permissions needed to read the configured member and manage the configured roles. Place the bot's highest role above every Sparge-managed role.

Startup validation fetches guild roles and the bot member, then refuses to keep the integration running if a configured role is missing, Discord-managed, or at/above the bot's highest role.

The bot only adds or removes these automatic mappings:

- `verifiedWallet`
- `participant`
- `matureParticipant`

It never removes unrelated member roles. Observer, Public Observer, Builder, and Early Alpha remain manual in this version.

## Required secrets

Set through the runtime environment or a deployment secret manager:

```text
COMMUNITY_IDENTITY_ENABLED=true
COMMUNITY_PUBLIC_BASE_URL=https://explorer.example.com
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_OAUTH_REDIRECT_URI=https://explorer.example.com/api/community/discord/callback
COMMUNITY_ROLE_SYNC_ENABLED=true
```

Never commit real values to `.env.example`, Compose YAML, config YAML, logs, screenshots, or support tickets. Production Compose passes environment values only to the producer.

Role IDs remain non-secret configuration under `communityIdentity.discord.roles`. Never hardcode them in source.

## Sessions and challenges

Sessions are opaque, server-side, short-lived, and use `HttpOnly`, `SameSite=Lax`, and production `Secure` cookies. State-changing routes require `X-CSRF-Token`.

OAuth access tokens exist only for the Discord `/users/@me` call and are not returned or persisted. Authorization codes and tokens must never be logged.

The production Caddy configuration skips access logging for the OAuth callback route because Discord authorization codes are unavoidable short-lived query parameters. Do not remove that exception without an equivalent query-redaction mechanism.

The wallet challenge binds version, action, chain ID, domain, immutable Discord user ID, wallet address, random nonce, issue time, expiry, and signature scheme. SQLite stores its SHA-256 hash. Consumption and link creation happen in one transaction.

## Role synchronization worker

The producer synchronizes immediately after linking, on authenticated manual request, and every `roleSync.intervalSeconds`. Discord role updates are idempotent.

Discord HTTP 429 handling follows `Retry-After`; do not hardcode Discord's dynamic route buckets. A transient failure delays synchronization and does not alter chain state or grant fallback roles.

## Deployment

The callback and community APIs must be reachable only through the production HTTPS origin. Caddy already proxies `/api/community/*`; do not expose producer port `3051` directly.

After setting secrets:

1. Run `npm run test:community-identity`.
2. Validate the Discord role hierarchy.
3. Start the producer and confirm `GET /api/community/status` returns enabled.
4. Link a dedicated test wallet and Discord member.
5. Verify unrelated Discord roles survive sync and unlink.
6. Confirm public profile fields remain absent until explicitly enabled.

## Incident response

For suspected client-secret or bot-token exposure:

1. Set `COMMUNITY_IDENTITY_ENABLED=false` and restart the producer.
2. Rotate the affected credential in the Discord Developer Portal.
3. Replace deployment secrets and restart.
4. Review privacy-safe `community_identity` events and Discord audit logs.
5. Revalidate bot role hierarchy before re-enabling.

Disabling this integration does not affect wallets, blocks, transactions, Participants, rewards, observers, or consensus.
