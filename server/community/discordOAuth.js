class DiscordOAuthError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function sanitizeDisplayName(user) {
  const raw = String(user?.global_name || user?.username || 'Discord user');
  return raw.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 64) || 'Discord user';
}

class DiscordOAuth {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config.discord;
    this.fetch = fetchImpl;
  }

  authorizationUrl(state) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('redirect_uri', this.config.oauthRedirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  }

  async exchangeCode(code) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.oauthRedirectUri
    });
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await this.fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new DiscordOAuthError('DISCORD_TOKEN_EXCHANGE_FAILED', 'Discord authentication could not be completed');
    }
    return payload.access_token;
  }

  async currentUser(accessToken) {
    const response = await this.fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || !/^[0-9]{15,22}$/.test(String(user.id || ''))) {
      throw new DiscordOAuthError('DISCORD_USER_LOOKUP_FAILED', 'Discord identity could not be read');
    }
    return { id: String(user.id), displayName: sanitizeDisplayName(user) };
  }

  async requireGuildMembership(discordUserId) {
    const response = await this.fetch(`https://discord.com/api/v10/guilds/${this.config.guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${this.config.botToken}` }
    });
    if (response.status === 404) {
      throw new DiscordOAuthError('DISCORD_GUILD_MEMBERSHIP_REQUIRED', 'Join the Sparge Discord server before linking', 403);
    }
    if (!response.ok) throw new DiscordOAuthError('DISCORD_GUILD_LOOKUP_FAILED', 'Discord membership could not be verified');
    return true;
  }

  async authenticate(code) {
    const accessToken = await this.exchangeCode(code);
    try {
      const user = await this.currentUser(accessToken);
      await this.requireGuildMembership(user.id);
      return user;
    } finally {
      // Access tokens are intentionally not returned, logged, or persisted.
    }
  }
}

module.exports = { DiscordOAuth, DiscordOAuthError, sanitizeDisplayName };
