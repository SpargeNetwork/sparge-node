const { evaluateAutomaticRoles } = require('./roleRules');

const AUTOMATIC_KEYS = ['verifiedWallet', 'participant', 'matureParticipant'];

class RoleSyncService {
  constructor({ repository, bot, blockchain, config, logger, now = () => Date.now() }) {
    this.repository = repository;
    this.bot = bot;
    this.blockchain = blockchain;
    this.config = config;
    this.logger = logger;
    this.now = now;
    this.timer = null;
    this.running = new Set();
  }

  async validate() {
    if (!this.config.roleSync.enabled) return true;
    return this.bot.validateRoleHierarchy();
  }

  start() {
    if (!this.config.roleSync.enabled || this.timer) return;
    this.timer = setInterval(() => this.syncAll().catch(() => {}), this.config.roleSync.intervalSeconds * 1000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncIdentity(identity) {
    if (!identity || identity.status !== 'linked') return { status: 'not_linked', roles: [] };
    if (this.running.has(identity.id)) return { status: 'already_running', roles: [] };
    this.running.add(identity.id);
    const started = this.now();
    this.logger?.info('role_sync_started', { operation: 'community_role_sync', identityRef: identity.id }, 'Community role sync started');
    try {
      const addressState = this.blockchain.getAddressStats(identity.walletAddress);
      const desired = evaluateAutomaticRoles(identity, addressState);
      const member = await this.bot.getMember(identity.discordUserId);
      const existing = new Set((member.roles || []).map(String));
      const result = [];
      for (const key of AUTOMATIC_KEYS) {
        const roleId = this.config.discord.roles[key];
        if (!roleId) continue;
        const eligible = desired[key] === true;
        let applied = existing.has(roleId);
        if (eligible && !applied) {
          await this.bot.addRole(identity.discordUserId, roleId);
          applied = true;
        } else if (!eligible && applied) {
          await this.bot.removeRole(identity.discordUserId, roleId);
          applied = false;
        }
        this.repository.saveRoleState(identity.id, key, roleId, { eligible, applied }, this.now());
        result.push({ key, eligible, applied });
      }
      this.repository.markRoleSync(identity.id, this.now());
      this.logger?.info('role_sync_completed', {
        operation: 'community_role_sync',
        identityRef: identity.id,
        durationMs: this.now() - started,
        result: 'success'
      }, 'Community role sync completed');
      return { status: 'synced', roles: result };
    } catch (err) {
      this.logger?.warn('role_sync_failed', {
        operation: 'community_role_sync',
        identityRef: identity.id,
        errorCode: err.code || 'ROLE_SYNC_FAILED',
        durationMs: this.now() - started,
        result: 'delayed'
      }, 'Community role sync delayed');
      return { status: 'delayed', errorCode: err.code || 'ROLE_SYNC_FAILED', roles: [] };
    } finally {
      this.running.delete(identity.id);
    }
  }

  async removeManagedRoles(identity) {
    const member = await this.bot.getMember(identity.discordUserId);
    const existing = new Set((member.roles || []).map(String));
    for (const key of AUTOMATIC_KEYS) {
      const roleId = this.config.discord.roles[key];
      if (!roleId) continue;
      if (existing.has(roleId)) await this.bot.removeRole(identity.discordUserId, roleId);
      this.repository.saveRoleState(identity.id, key, roleId, { eligible: false, applied: false }, this.now());
    }
  }

  async syncAll() {
    for (const identity of this.repository.listLinked()) {
      await this.syncIdentity(identity);
    }
    for (const identity of this.repository.listUnlinkedWithAppliedRoles()) {
      await this.removeManagedRoles(identity).catch(() => {});
    }
  }
}

module.exports = { RoleSyncService, AUTOMATIC_KEYS };
