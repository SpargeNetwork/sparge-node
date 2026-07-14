class DiscordApiError extends Error {
  constructor(code, message, status = 502, retryAfterSeconds = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DiscordBot {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config.discord;
    this.fetch = fetchImpl;
  }

  async request(path, options = {}, retry = true) {
    const response = await this.fetch(`https://discord.com/api/v10${path}`, {
      ...options,
      headers: {
        Authorization: `Bot ${this.config.botToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (response.status === 429) {
      const payload = await response.json().catch(() => ({}));
      const retryAfter = Math.max(1, Number(payload.retry_after || response.headers.get('Retry-After') || 1));
      if (retry && retryAfter <= 10) {
        await sleep(Math.ceil(retryAfter * 1000));
        return this.request(path, options, false);
      }
      throw new DiscordApiError('DISCORD_RATE_LIMITED', 'Discord temporarily rate limited role synchronization', 503, retryAfter);
    }
    if (response.status === 404) throw new DiscordApiError('DISCORD_MEMBER_NOT_FOUND', 'Discord member is not in the configured server', 404);
    if (!response.ok) throw new DiscordApiError('DISCORD_API_FAILED', 'Discord role synchronization failed', 502);
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  }

  getMember(discordUserId) {
    return this.request(`/guilds/${this.config.guildId}/members/${discordUserId}`);
  }

  addRole(discordUserId, roleId) {
    return this.request(`/guilds/${this.config.guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'PUT' });
  }

  removeRole(discordUserId, roleId) {
    return this.request(`/guilds/${this.config.guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'DELETE' });
  }

  async validateRoleHierarchy() {
    const [bot, roles] = await Promise.all([
      this.request('/users/@me'),
      this.request(`/guilds/${this.config.guildId}/roles`)
    ]);
    const member = await this.getMember(String(bot.id));
    const roleMap = new Map((roles || []).map((role) => [String(role.id), role]));
    const highest = (member.roles || []).map((id) => roleMap.get(String(id))?.position ?? -1).reduce((max, value) => Math.max(max, value), -1);
    const configured = Object.entries(this.config.roles).filter(([, id]) => id);
    for (const [key, roleId] of configured) {
      const role = roleMap.get(roleId);
      if (!role) throw new DiscordApiError('DISCORD_ROLE_NOT_FOUND', `Configured Discord role ${key} does not exist`, 500);
      if (role.managed || role.position >= highest) {
        throw new DiscordApiError('DISCORD_ROLE_HIERARCHY_INVALID', `Bot cannot manage configured Discord role ${key}`, 500);
      }
    }
    return true;
  }
}

module.exports = { DiscordBot, DiscordApiError };
