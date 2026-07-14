const crypto = require('crypto');
const { deriveAddress, verifyCanonicalMessage } = require('../lib/tx');
const { createWalletChallenge, challengeHash } = require('./walletChallenge');
const { rolePresentation, ROLE_DEFINITIONS } = require('./roleRules');
const { CommunityIdentityError } = require('./identityRepository');

function privacyFromRow(row) {
  return {
    publicProfileEnabled: row.publicProfileEnabled === 1,
    publicDiscordNameEnabled: row.publicDiscordNameEnabled === 1,
    publicBadgesEnabled: row.publicBadgesEnabled === 1,
    publicWalletVerifiedEnabled: row.publicWalletVerifiedEnabled === 1,
    publicParticipantStatusEnabled: row.publicParticipantStatusEnabled === 1,
    publicObserverStatusEnabled: row.publicObserverStatusEnabled === 1,
    publicBalanceEnabled: row.publicBalanceEnabled === 1
  };
}

function discordRef(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

class IdentityService {
  constructor({ repository, blockchain, roleSync, config, logger, now = () => Date.now() }) {
    this.repository = repository;
    this.blockchain = blockchain;
    this.roleSync = roleSync;
    this.config = config;
    this.logger = logger;
    this.now = now;
  }

  createChallenge(discordUserId, walletAddress) {
    const generated = createWalletChallenge({
      chainId: this.config.chainId,
      domain: this.config.community.domain,
      discordUserId,
      walletAddress,
      expiresSeconds: this.config.community.challenge.expiresSeconds,
      now: this.now()
    });
    this.repository.createChallenge({
      challengeId: generated.challengeId,
      discordUserId,
      walletAddress,
      challengeHash: generated.challengeHash,
      createdAt: this.now(),
      expiresAt: Date.parse(generated.expiresAt)
    });
    this.logger?.info('wallet_link_challenge_created', {
      operation: 'community_identity',
      discordRef: discordRef(discordUserId),
      walletRef: walletAddress.slice(0, 12),
      result: 'created'
    }, 'Wallet link challenge created');
    return {
      challengeId: generated.challengeId,
      challenge: generated.challenge,
      expiresAt: generated.expiresAt,
      signatureScheme: 'sparge-ed25519-sha256-v1'
    };
  }

  async verifyAndLink({ session, challengeId, challenge, walletAddress, publicKeyHex, signatureHex }) {
    const record = this.repository.getChallenge(challengeId);
    if (!record) throw new CommunityIdentityError('CHALLENGE_NOT_FOUND', 'Verification challenge is invalid or expired', 404);
    if (record.discordUserId !== session.discordUserId || record.walletAddress !== walletAddress) {
      throw new CommunityIdentityError('CHALLENGE_MISMATCH', 'Verification challenge does not match this account', 400);
    }
    if (record.expiresAt <= this.now()) throw new CommunityIdentityError('CHALLENGE_EXPIRED', 'Verification challenge has expired', 410);
    if (record.status !== 'pending') throw new CommunityIdentityError('CHALLENGE_ALREADY_USED', 'Verification challenge has already been used', 409);
    if (challengeHash(challenge) !== record.challengeHash) {
      throw new CommunityIdentityError('CHALLENGE_MISMATCH', 'Verification challenge does not match', 400);
    }
    let derived;
    try {
      derived = deriveAddress(publicKeyHex);
    } catch {
      throw new CommunityIdentityError('PUBLIC_KEY_INVALID', 'Wallet verification failed', 400);
    }
    if (derived !== walletAddress) throw new CommunityIdentityError('WALLET_KEY_MISMATCH', 'Wallet verification failed', 400);
    let valid = false;
    try {
      valid = verifyCanonicalMessage(challenge, publicKeyHex, signatureHex);
    } catch {
      valid = false;
    }
    if (!valid) throw new CommunityIdentityError('SIGNATURE_INVALID', 'Wallet verification failed', 400);

    const identity = this.repository.consumeAndLink({
      challengeId,
      challengeHash: record.challengeHash,
      discordUserId: session.discordUserId,
      walletAddress,
      discordDisplayName: session.discordDisplayName,
      defaults: this.config.community.privacy,
      now: this.now()
    });
    const sync = this.config.community.roleSync.enabled
      ? await this.roleSync.syncIdentity(identity)
      : { status: 'disabled', roles: [] };
    this.logger?.info('wallet_link_verified', {
      operation: 'community_identity',
      discordRef: discordRef(session.discordUserId),
      walletRef: walletAddress.slice(0, 12),
      result: 'linked'
    }, 'Wallet link verified');
    return { identity: this.privateView(identity), roleSync: sync };
  }

  privateView(identity) {
    if (!identity || identity.status !== 'linked') return null;
    const roles = rolePresentation(this.repository.getRoleStates(identity.id));
    return {
      linked: true,
      discordDisplayName: identity.discordDisplayName || 'Discord user',
      walletAddress: identity.walletAddress,
      linkedAt: new Date(identity.linkedAt).toISOString(),
      lastVerifiedAt: new Date(identity.lastVerifiedAt).toISOString(),
      lastRoleSyncAt: identity.lastRoleSyncAt ? new Date(identity.lastRoleSyncAt).toISOString() : null,
      roles,
      privacy: privacyFromRow(identity)
    };
  }

  getForDiscord(discordUserId) {
    return this.privateView(this.repository.getByDiscordUserId(discordUserId));
  }

  async sync(discordUserId) {
    const identity = this.repository.getByDiscordUserId(discordUserId);
    if (!identity || identity.status !== 'linked') throw new CommunityIdentityError('IDENTITY_NOT_LINKED', 'No linked wallet', 404);
    const result = await this.roleSync.syncIdentity(identity);
    return { ...this.privateView(this.repository.getByDiscordUserId(discordUserId)), roleSyncStatus: result.status };
  }

  async unlink(discordUserId) {
    const identity = this.repository.getByDiscordUserId(discordUserId);
    if (!identity || identity.status !== 'linked') throw new CommunityIdentityError('IDENTITY_NOT_LINKED', 'No linked wallet', 404);
    this.repository.unlink(identity.id, this.now());
    let roleCleanupStatus = 'disabled';
    if (this.config.community.roleSync.enabled) {
      try {
        await this.roleSync.removeManagedRoles(identity);
        roleCleanupStatus = 'completed';
      } catch (err) {
        roleCleanupStatus = 'delayed';
        this.logger?.warn('role_sync_failed', {
          operation: 'community_unlink_cleanup',
          identityRef: identity.id,
          errorCode: err.code || 'ROLE_CLEANUP_FAILED',
          result: 'delayed'
        }, 'Community unlink role cleanup delayed');
      }
    }
    this.logger?.info('wallet_unlinked', {
      operation: 'community_identity', discordRef: discordRef(discordUserId), walletRef: identity.walletAddress.slice(0, 12), result: 'unlinked'
    }, 'Wallet unlinked');
    return { roleCleanupStatus };
  }

  updatePrivacy(discordUserId, privacy) {
    const identity = this.repository.getByDiscordUserId(discordUserId);
    if (!identity || identity.status !== 'linked') throw new CommunityIdentityError('IDENTITY_NOT_LINKED', 'No linked wallet', 404);
    const updated = this.repository.updatePrivacy(identity.id, privacy, this.now());
    this.logger?.info('public_profile_updated', {
      operation: 'community_identity', discordRef: discordRef(discordUserId), walletRef: identity.walletAddress.slice(0, 12), result: 'updated'
    }, 'Community profile privacy updated');
    return this.privateView(updated);
  }

  publicProfile(walletAddress) {
    const identity = this.repository.getByWallet(walletAddress);
    if (!identity || identity.publicProfileEnabled !== 1) return null;
    const privacy = privacyFromRow(identity);
    const state = this.blockchain.getAddressStats(walletAddress);
    const roleStates = this.repository.getRoleStates(identity.id);
    const applied = new Set(roleStates.filter((item) => item.applied === 1).map((item) => item.roleKey));
    const badges = [];
    if (privacy.publicBadgesEnabled) {
      for (const key of applied) badges.push({ key, label: ROLE_DEFINITIONS[key]?.label || key });
    }
    return {
      verifiedProfile: true,
      walletAddress: privacy.publicWalletVerifiedEnabled ? walletAddress : null,
      discordDisplayName: privacy.publicDiscordNameEnabled ? identity.discordDisplayName : null,
      badges,
      participantStatus: privacy.publicParticipantStatusEnabled ? (state.participant?.status || null) : null,
      observerStatus: privacy.publicObserverStatusEnabled ? null : null,
      balanceMicro: privacy.publicBalanceEnabled ? state.balanceMicro : null
    };
  }
}

module.exports = { IdentityService, privacyFromRow, discordRef };
