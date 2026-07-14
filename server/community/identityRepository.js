const path = require('path');
const Database = require('better-sqlite3');

class CommunityIdentityError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class IdentityRepository {
  constructor(dataDir, options = {}) {
    const dbPath = options.dbPath || path.join(dataDir, 'state.db');
    this.db = options.db || new Database(dbPath);
    this.ownsDb = !options.db;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS community_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discordUserId TEXT NOT NULL UNIQUE,
        walletAddress TEXT NOT NULL UNIQUE,
        discordDisplayName TEXT,
        linkedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastVerifiedAt INTEGER NOT NULL,
        lastRoleSyncAt INTEGER,
        publicProfileEnabled INTEGER NOT NULL DEFAULT 0,
        publicDiscordNameEnabled INTEGER NOT NULL DEFAULT 0,
        publicBadgesEnabled INTEGER NOT NULL DEFAULT 0,
        publicWalletVerifiedEnabled INTEGER NOT NULL DEFAULT 0,
        publicParticipantStatusEnabled INTEGER NOT NULL DEFAULT 0,
        publicObserverStatusEnabled INTEGER NOT NULL DEFAULT 0,
        publicBalanceEnabled INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'linked' CHECK(status IN ('linked', 'unlinked'))
      );

      CREATE TABLE IF NOT EXISTS identity_challenges (
        challengeId TEXT PRIMARY KEY,
        discordUserId TEXT NOT NULL,
        walletAddress TEXT NOT NULL,
        challengeHash TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        consumedAt INTEGER,
        status TEXT NOT NULL CHECK(status IN ('pending', 'consumed', 'expired'))
      );

      CREATE INDEX IF NOT EXISTS idx_identity_challenges_expiry ON identity_challenges(expiresAt);

      CREATE TABLE IF NOT EXISTS identity_role_state (
        identityId INTEGER NOT NULL,
        roleKey TEXT NOT NULL,
        discordRoleId TEXT NOT NULL,
        eligible INTEGER NOT NULL,
        applied INTEGER NOT NULL,
        lastCheckedAt INTEGER NOT NULL,
        lastErrorCode TEXT,
        PRIMARY KEY(identityId, roleKey),
        FOREIGN KEY(identityId) REFERENCES community_identities(id) ON DELETE CASCADE
      );
    `);
  }

  createChallenge(record) {
    this.db.prepare(`
      INSERT INTO identity_challenges(challengeId, discordUserId, walletAddress, challengeHash, createdAt, expiresAt, status)
      VALUES(@challengeId, @discordUserId, @walletAddress, @challengeHash, @createdAt, @expiresAt, 'pending')
    `).run(record);
  }

  getChallenge(challengeId) {
    return this.db.prepare('SELECT * FROM identity_challenges WHERE challengeId = ?').get(challengeId) || null;
  }

  consumeAndLink({ challengeId, challengeHash, discordUserId, walletAddress, discordDisplayName, defaults, now }) {
    return this.db.transaction(() => {
      const challenge = this.getChallenge(challengeId);
      if (!challenge) throw new CommunityIdentityError('CHALLENGE_NOT_FOUND', 'Verification challenge is invalid or expired', 404);
      if (challenge.status !== 'pending' || challenge.consumedAt !== null) {
        throw new CommunityIdentityError('CHALLENGE_ALREADY_USED', 'Verification challenge has already been used', 409);
      }
      if (challenge.expiresAt <= now) {
        this.db.prepare("UPDATE identity_challenges SET status = 'expired' WHERE challengeId = ?").run(challengeId);
        throw new CommunityIdentityError('CHALLENGE_EXPIRED', 'Verification challenge has expired', 410);
      }
      if (challenge.discordUserId !== discordUserId || challenge.walletAddress !== walletAddress || challenge.challengeHash !== challengeHash) {
        throw new CommunityIdentityError('CHALLENGE_MISMATCH', 'Verification challenge does not match this account', 400);
      }
      const walletOwner = this.db.prepare("SELECT discordUserId FROM community_identities WHERE walletAddress = ? AND status = 'linked'").get(walletAddress);
      if (walletOwner && walletOwner.discordUserId !== discordUserId) {
        throw new CommunityIdentityError('WALLET_ALREADY_LINKED', 'This wallet is already linked to another account', 409);
      }
      const existing = this.db.prepare('SELECT * FROM community_identities WHERE discordUserId = ?').get(discordUserId);
      if (existing) {
        const changingWallet = existing.walletAddress !== walletAddress;
        this.db.prepare(`
          UPDATE community_identities SET
            walletAddress = ?, discordDisplayName = ?, updatedAt = ?, lastVerifiedAt = ?, status = 'linked',
            publicProfileEnabled = CASE WHEN ? THEN 0 ELSE publicProfileEnabled END,
            publicDiscordNameEnabled = CASE WHEN ? THEN 0 ELSE publicDiscordNameEnabled END,
            publicBadgesEnabled = CASE WHEN ? THEN 0 ELSE publicBadgesEnabled END,
            publicWalletVerifiedEnabled = CASE WHEN ? THEN 0 ELSE publicWalletVerifiedEnabled END,
            publicParticipantStatusEnabled = CASE WHEN ? THEN 0 ELSE publicParticipantStatusEnabled END,
            publicObserverStatusEnabled = CASE WHEN ? THEN 0 ELSE publicObserverStatusEnabled END,
            publicBalanceEnabled = CASE WHEN ? THEN 0 ELSE publicBalanceEnabled END
          WHERE discordUserId = ?
        `).run(
          walletAddress, discordDisplayName, now, now,
          changingWallet ? 1 : 0, changingWallet ? 1 : 0, changingWallet ? 1 : 0,
          changingWallet ? 1 : 0, changingWallet ? 1 : 0, changingWallet ? 1 : 0,
          changingWallet ? 1 : 0, discordUserId
        );
      } else {
        this.db.prepare(`
          INSERT INTO community_identities(
            discordUserId, walletAddress, discordDisplayName, linkedAt, updatedAt, lastVerifiedAt,
            publicProfileEnabled, publicDiscordNameEnabled, publicBadgesEnabled,
            publicWalletVerifiedEnabled, publicParticipantStatusEnabled,
            publicObserverStatusEnabled, publicBalanceEnabled, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'linked')
        `).run(
          discordUserId, walletAddress, discordDisplayName, now, now, now,
          defaults.publicProfilesDefault ? 1 : 0,
          defaults.publicDiscordNameDefault ? 1 : 0,
          defaults.publicBadgesDefault ? 1 : 0,
          defaults.publicWalletVerifiedDefault ? 1 : 0,
          defaults.publicParticipantStatusDefault ? 1 : 0,
          defaults.publicObserverStatusDefault ? 1 : 0,
          defaults.publicBalanceDefault ? 1 : 0
        );
      }
      this.db.prepare("UPDATE identity_challenges SET status = 'consumed', consumedAt = ? WHERE challengeId = ? AND status = 'pending'").run(now, challengeId);
      return this.getByDiscordUserId(discordUserId);
    })();
  }

  getByDiscordUserId(discordUserId) {
    return this.db.prepare('SELECT * FROM community_identities WHERE discordUserId = ?').get(discordUserId) || null;
  }

  getByWallet(walletAddress) {
    return this.db.prepare("SELECT * FROM community_identities WHERE walletAddress = ? AND status = 'linked'").get(walletAddress) || null;
  }

  listLinked() {
    return this.db.prepare("SELECT * FROM community_identities WHERE status = 'linked' ORDER BY id").all();
  }

  listUnlinkedWithAppliedRoles() {
    return this.db.prepare(`
      SELECT DISTINCT i.* FROM community_identities i
      JOIN identity_role_state r ON r.identityId = i.id
      WHERE i.status = 'unlinked' AND r.applied = 1
      ORDER BY i.id
    `).all();
  }

  updatePrivacy(identityId, privacy, now) {
    this.db.prepare(`
      UPDATE community_identities SET
        publicProfileEnabled = @publicProfileEnabled,
        publicDiscordNameEnabled = @publicDiscordNameEnabled,
        publicBadgesEnabled = @publicBadgesEnabled,
        publicWalletVerifiedEnabled = @publicWalletVerifiedEnabled,
        publicParticipantStatusEnabled = @publicParticipantStatusEnabled,
        publicObserverStatusEnabled = @publicObserverStatusEnabled,
        publicBalanceEnabled = @publicBalanceEnabled,
        updatedAt = @now
      WHERE id = @identityId AND status = 'linked'
    `).run({ identityId, now, ...Object.fromEntries(Object.entries(privacy).map(([key, value]) => [key, value ? 1 : 0])) });
    return this.db.prepare('SELECT * FROM community_identities WHERE id = ?').get(identityId) || null;
  }

  unlink(identityId, now) {
    this.db.prepare(`
      UPDATE community_identities SET status = 'unlinked', walletAddress = 'unlinked:' || id || ':' || ?, updatedAt = ?,
        publicProfileEnabled = 0, publicDiscordNameEnabled = 0, publicBadgesEnabled = 0,
        publicWalletVerifiedEnabled = 0, publicParticipantStatusEnabled = 0,
        publicObserverStatusEnabled = 0, publicBalanceEnabled = 0
      WHERE id = ?
    `).run(now, now, identityId);
  }

  saveRoleState(identityId, roleKey, discordRoleId, state, now) {
    this.db.prepare(`
      INSERT INTO identity_role_state(identityId, roleKey, discordRoleId, eligible, applied, lastCheckedAt, lastErrorCode)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(identityId, roleKey) DO UPDATE SET
        discordRoleId = excluded.discordRoleId,
        eligible = excluded.eligible,
        applied = excluded.applied,
        lastCheckedAt = excluded.lastCheckedAt,
        lastErrorCode = excluded.lastErrorCode
    `).run(identityId, roleKey, discordRoleId, state.eligible ? 1 : 0, state.applied ? 1 : 0, now, state.errorCode || null);
  }

  markRoleSync(identityId, now) {
    this.db.prepare('UPDATE community_identities SET lastRoleSyncAt = ?, updatedAt = ? WHERE id = ?').run(now, now, identityId);
  }

  getRoleStates(identityId) {
    return this.db.prepare('SELECT roleKey, discordRoleId, eligible, applied, lastCheckedAt, lastErrorCode FROM identity_role_state WHERE identityId = ? ORDER BY roleKey').all(identityId);
  }

  cleanupChallenges(cutoff) {
    return this.db.prepare('DELETE FROM identity_challenges WHERE expiresAt < ? AND status != ?').run(cutoff, 'pending').changes;
  }

  close() {
    if (this.ownsDb) this.db.close();
  }
}

module.exports = { IdentityRepository, CommunityIdentityError };
