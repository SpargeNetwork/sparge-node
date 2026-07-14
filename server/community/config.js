const ROLE_KEYS = [
  'verifiedWallet',
  'participant',
  'matureParticipant',
  'observerOperator',
  'publicObserver',
  'builder',
  'earlyAlpha'
];

function envBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('Community identity boolean environment value is invalid');
}

function positiveInteger(value, field, fallback, max = 86400 * 365) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${field} must be a positive safe integer <= ${max}`);
  }
  return parsed;
}

function cleanString(value, max = 2048) {
  const result = String(value || '').trim();
  if (result.length > max) throw new Error('Community identity configuration value is too long');
  return result;
}

function absoluteUrl(value, field, required) {
  const text = cleanString(value);
  if (!text && !required) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${field} must be an absolute HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field} must use HTTP(S)`);
  if (parsed.username || parsed.password || parsed.hash) throw new Error(`${field} must not contain credentials or a fragment`);
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) throw new Error(`${field} must use HTTPS outside localhost`);
  return parsed.toString();
}

function snowflake(value, field, required = false) {
  const text = cleanString(value, 32);
  if (!text && !required) return '';
  if (!/^[0-9]{15,22}$/.test(text)) throw new Error(`${field} must be a Discord snowflake`);
  return text;
}

function normalizeCommunityIdentityConfig(config) {
  const src = config.communityIdentity && typeof config.communityIdentity === 'object'
    ? config.communityIdentity
    : {};
  const discordSrc = src.discord && typeof src.discord === 'object' ? src.discord : {};
  const privacySrc = src.privacy && typeof src.privacy === 'object' ? src.privacy : {};
  const challengeSrc = src.challenge && typeof src.challenge === 'object' ? src.challenge : {};
  const roleSyncSrc = src.roleSync && typeof src.roleSync === 'object' ? src.roleSync : {};
  const enabled = envBool(process.env.COMMUNITY_IDENTITY_ENABLED, src.enabled === true);
  const publicBaseUrl = absoluteUrl(process.env.COMMUNITY_PUBLIC_BASE_URL ?? src.publicBaseUrl, 'communityIdentity.publicBaseUrl', enabled);
  const redirectUri = absoluteUrl(process.env.DISCORD_OAUTH_REDIRECT_URI ?? discordSrc.oauthRedirectUri, 'communityIdentity.discord.oauthRedirectUri', enabled);
  const roleSyncEnabled = envBool(process.env.COMMUNITY_ROLE_SYNC_ENABLED, roleSyncSrc.enabled !== false);

  const roles = {};
  const sourceRoles = discordSrc.roles && typeof discordSrc.roles === 'object' ? discordSrc.roles : {};
  for (const key of ROLE_KEYS) roles[key] = snowflake(sourceRoles[key], `communityIdentity.discord.roles.${key}`, false);

  const out = {
    enabled,
    publicBaseUrl,
    domain: publicBaseUrl ? new URL(publicBaseUrl).host.toLowerCase() : '',
    discord: {
      clientId: snowflake(process.env.DISCORD_CLIENT_ID ?? discordSrc.clientId, 'communityIdentity.discord.clientId', enabled),
      clientSecret: cleanString(process.env.DISCORD_CLIENT_SECRET ?? discordSrc.clientSecret, 256),
      botToken: cleanString(process.env.DISCORD_BOT_TOKEN ?? discordSrc.botToken, 256),
      guildId: snowflake(process.env.DISCORD_GUILD_ID ?? discordSrc.guildId, 'communityIdentity.discord.guildId', enabled),
      oauthRedirectUri: redirectUri,
      roles
    },
    challenge: {
      expiresSeconds: positiveInteger(challengeSrc.expiresSeconds, 'communityIdentity.challenge.expiresSeconds', 600, 3600)
    },
    sessions: {
      expiresSeconds: positiveInteger(src.sessions?.expiresSeconds, 'communityIdentity.sessions.expiresSeconds', 1800, 86400)
    },
    roleSync: {
      enabled: roleSyncEnabled,
      intervalSeconds: positiveInteger(roleSyncSrc.intervalSeconds, 'communityIdentity.roleSync.intervalSeconds', 300, 86400),
      failureGraceSeconds: positiveInteger(roleSyncSrc.failureGraceSeconds, 'communityIdentity.roleSync.failureGraceSeconds', 1800, 86400 * 30)
    },
    privacy: {
      publicProfilesDefault: privacySrc.publicProfilesDefault === true,
      publicDiscordNameDefault: privacySrc.publicDiscordNameDefault === true,
      publicBadgesDefault: privacySrc.publicBadgesDefault === true,
      publicWalletVerifiedDefault: privacySrc.publicWalletVerifiedDefault === true,
      publicParticipantStatusDefault: privacySrc.publicParticipantStatusDefault === true,
      publicObserverStatusDefault: privacySrc.publicObserverStatusDefault === true,
      publicBalanceDefault: privacySrc.publicBalanceDefault === true
    }
  };

  if (enabled) {
    if (config.storage?.backend === 'json') throw new Error('Community identity requires SQLite storage');
    if (!out.discord.clientSecret) throw new Error('DISCORD_CLIENT_SECRET is required when community identity is enabled');
    if (!out.discord.botToken) throw new Error('DISCORD_BOT_TOKEN is required when community identity is enabled');
    if (new URL(out.discord.oauthRedirectUri).origin !== new URL(out.publicBaseUrl).origin) {
      throw new Error('Discord OAuth redirect URI must use the configured community public origin');
    }
    if (out.roleSync.enabled && !out.discord.roles.verifiedWallet) {
      throw new Error('A verifiedWallet Discord role ID is required when role sync is enabled');
    }
  }

  config.communityIdentity = out;
  return out;
}

module.exports = { ROLE_KEYS, normalizeCommunityIdentityConfig };
