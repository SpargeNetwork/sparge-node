const crypto = require('crypto');
const express = require('express');
const { validateBody, validateParams } = require('../lib/validation/middleware');
const {
  communityChallengeBody,
  communityVerifyBody,
  communityUnlinkBody,
  communityPrivacyBody,
  communityProfileParams
} = require('../lib/validation/schemas');

function httpError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function safeReturnPath(value) {
  const text = String(value || '/wallet').trim();
  if (!text.startsWith('/') || text.startsWith('//') || text.length > 200 || /[\r\n]/.test(text)) return '/wallet';
  return text;
}

function communityRouter({ config, sessions, oauth, identityService, logger }) {
  const router = express.Router();
  const community = config.communityIdentity;

  router.get('/status', (req, res) => {
    res.json({
      enabled: community.enabled === true,
      challengeVersion: community.enabled ? 1 : null,
      roleSyncEnabled: community.enabled ? community.roleSync.enabled : false,
      publicProfilesAvailable: community.enabled === true
    });
  });

  router.use((req, res, next) => {
    if (!community.enabled) {
      res.status(404).json({ error: 'COMMUNITY_IDENTITY_DISABLED', message: 'Community identity is not available', requestId: req.requestId });
      return;
    }
    next();
  });

  const requireDiscord = (req, res, next) => {
    const session = sessions.get(req);
    if (!session?.discordUserId) {
      res.status(401).json({ error: 'DISCORD_AUTH_REQUIRED', message: 'Connect Discord first', requestId: req.requestId });
      return;
    }
    req.communitySession = session;
    next();
  };

  const requireCsrf = (req, res, next) => {
    if (!sessions.requireCsrf(req, req.communitySession)) {
      res.status(403).json({ error: 'CSRF_REJECTED', message: 'Request could not be verified', requestId: req.requestId });
      return;
    }
    next();
  };

  router.get('/discord/start', (req, res, next) => {
    try {
      const session = sessions.ensure(req);
      const state = crypto.randomBytes(32).toString('base64url');
      session.oauthStateHash = crypto.createHash('sha256').update(state).digest('hex');
      session.oauthStateExpiresAt = Date.now() + 10 * 60 * 1000;
      session.returnTo = safeReturnPath(req.query.returnTo);
      sessions.setCookie(res, session);
      logger.info('discord_oauth_started', { operation: 'community_oauth', requestId: req.requestId, result: 'redirect' }, 'Discord OAuth started');
      res.redirect(302, oauth.authorizationUrl(state));
    } catch (err) {
      next(err);
    }
  });

  router.get('/discord/callback', async (req, res) => {
    const session = sessions.get(req);
    const returnTo = safeReturnPath(session?.returnTo);
    const redirect = (result) => {
      const url = new URL(returnTo, community.publicBaseUrl);
      url.searchParams.set('community', result);
      res.redirect(302, url.toString());
    };
    if (!session || !session.oauthStateHash || session.oauthStateExpiresAt <= Date.now()) {
      redirect('oauth-expired');
      return;
    }
    const expectedHash = session.oauthStateHash;
    delete session.oauthStateHash;
    delete session.oauthStateExpiresAt;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const actualHash = crypto.createHash('sha256').update(state).digest('hex');
    if (!state || !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))) {
      redirect('oauth-invalid');
      return;
    }
    const code = typeof req.query.code === 'string' && req.query.code.length <= 512 ? req.query.code : '';
    if (!code || req.query.error) {
      redirect('oauth-denied');
      return;
    }
    try {
      const user = await oauth.authenticate(code);
      const rotated = sessions.rotate(session, {
        discordUserId: user.id,
        discordDisplayName: user.displayName,
        oauthAuthenticatedAt: Date.now()
      });
      sessions.setCookie(res, rotated);
      logger.info('discord_oauth_completed', { operation: 'community_oauth', requestId: req.requestId, result: 'success' }, 'Discord OAuth completed');
      redirect('discord-connected');
    } catch (err) {
      logger.warn('discord_oauth_failed', { operation: 'community_oauth', requestId: req.requestId, errorCode: err.code || 'OAUTH_FAILED', result: 'failed' }, 'Discord OAuth failed');
      redirect(err.code === 'DISCORD_GUILD_MEMBERSHIP_REQUIRED' ? 'guild-required' : 'oauth-failed');
    }
  });

  router.get('/me', (req, res) => {
    let session = sessions.get(req);
    if (!session) {
      session = sessions.create();
      sessions.setCookie(res, session);
    }
    const identity = session.discordUserId ? identityService.getForDiscord(session.discordUserId) : null;
    res.json({
      authenticated: Boolean(session.discordUserId),
      discordConnected: Boolean(session.discordUserId),
      discordDisplayName: session.discordUserId ? session.discordDisplayName : null,
      csrfToken: session.csrfToken,
      identity
    });
  });

  router.post('/challenge', requireDiscord, requireCsrf, validateBody(communityChallengeBody), (req, res, next) => {
    try {
      res.status(201).json(identityService.createChallenge(req.communitySession.discordUserId, req.body.walletAddress));
    } catch (err) {
      next(err);
    }
  });

  router.post('/verify', requireDiscord, requireCsrf, validateBody(communityVerifyBody), async (req, res, next) => {
    try {
      const result = await identityService.verifyAndLink({ session: req.communitySession, ...req.body });
      const rotated = sessions.rotate(req.communitySession);
      sessions.setCookie(res, rotated);
      res.json(result);
    } catch (err) {
      logger.warn('wallet_link_failed', { operation: 'community_identity', requestId: req.requestId, errorCode: err.code || 'LINK_FAILED', result: 'failed' }, 'Wallet link failed');
      next(err);
    }
  });

  router.post('/sync-roles', requireDiscord, requireCsrf, async (req, res, next) => {
    try {
      res.json({ identity: await identityService.sync(req.communitySession.discordUserId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/privacy', requireDiscord, requireCsrf, validateBody(communityPrivacyBody), (req, res, next) => {
    try {
      res.json({ identity: identityService.updatePrivacy(req.communitySession.discordUserId, req.body) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/unlink', requireDiscord, requireCsrf, validateBody(communityUnlinkBody), async (req, res, next) => {
    try {
      const result = await identityService.unlink(req.communitySession.discordUserId);
      const rotated = sessions.rotate(req.communitySession);
      sessions.setCookie(res, rotated);
      res.json({ unlinked: true, roleCleanupStatus: result.roleCleanupStatus });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', requireDiscord, requireCsrf, (req, res) => {
    sessions.destroy(req.communitySession);
    sessions.clearCookie(res);
    res.json({ loggedOut: true });
  });

  router.get('/profile/:walletAddress', validateParams(communityProfileParams), (req, res) => {
    const profile = identityService.publicProfile(req.params.walletAddress);
    if (!profile) {
      res.status(404).json({ error: 'PROFILE_NOT_PUBLIC', message: 'No public community profile', requestId: req.requestId });
      return;
    }
    res.json(profile);
  });

  return router;
}

module.exports = { communityRouter, safeReturnPath, httpError };
