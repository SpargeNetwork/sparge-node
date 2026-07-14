const { IdentityRepository } = require('./identityRepository');
const { CommunitySessions } = require('./sessions');
const { DiscordOAuth } = require('./discordOAuth');
const { DiscordBot } = require('./discordBot');
const { RoleSyncService } = require('./roleSync');
const { IdentityService } = require('./identityService');

function createCommunityIdentity({ config, blockchain, dataDir, logger, fetchImpl }) {
  const community = config.communityIdentity;
  const sessions = new CommunitySessions(community);
  const oauth = new DiscordOAuth(community, fetchImpl);
  if (!community.enabled) {
    return { enabled: false, sessions, oauth, repository: null, roleSync: null, identityService: null };
  }
  const repository = new IdentityRepository(dataDir);
  const bot = new DiscordBot(community, fetchImpl);
  const roleSync = new RoleSyncService({ repository, bot, blockchain, config: community, logger });
  const identityService = new IdentityService({
    repository,
    blockchain,
    roleSync,
    config: { chainId: config.chain.chainId, community },
    logger
  });
  return { enabled: true, sessions, oauth, repository, roleSync, identityService };
}

module.exports = { createCommunityIdentity };
