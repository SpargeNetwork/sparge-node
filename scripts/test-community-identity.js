const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { IdentityRepository } = require('../server/community/identityRepository');
const { IdentityService } = require('../server/community/identityService');
const { RoleSyncService } = require('../server/community/roleSync');
const { CommunitySessions } = require('../server/community/sessions');
const { communityRouter } = require('../server/routes/community');
const { normalizeCommunityIdentityConfig } = require('../server/community/config');
const { deriveAddress, signCanonicalMessage } = require('../server/lib/tx');
const { redact } = require('../server/lib/logger');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
assert.ok(
  serverSource.indexOf("require('dotenv').config") < serverSource.indexOf("require('./lib/config')"),
  'environment file is loaded before node configuration'
);
const outDir = path.join(__dirname, 'out', 'community-identity');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function wallet() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const privateKeyHex = Buffer.from(pair.privateKey.export({ format: 'jwk' }).d, 'base64url').toString('hex');
  const publicKeyHex = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return { privateKeyHex, publicKeyHex, address: deriveAddress(publicKeyHex) };
}

function expectCode(promise, code) {
  return promise.then(
    () => assert.fail(`Expected ${code}`),
    (err) => assert.strictEqual(err.code, code)
  );
}

class FakeBot {
  constructor() {
    this.members = new Map();
    this.adds = [];
    this.removes = [];
  }
  async validateRoleHierarchy() { return true; }
  async getMember(id) { return { roles: [...(this.members.get(id) || new Set())] }; }
  async addRole(id, role) { this.members.get(id).add(role); this.adds.push([id, role]); }
  async removeRole(id, role) { this.members.get(id).delete(role); this.removes.push([id, role]); }
}

async function testIdentityCore() {
  let now = Date.now();
  const first = wallet();
  const second = wallet();
  const repository = new IdentityRepository(outDir);
  const bot = new FakeBot();
  bot.members.set('123456789012345678', new Set(['unrelated-role']));
  bot.members.set('223456789012345678', new Set());
  const states = new Map([[first.address, { balanceMicro: '1000', participant: { status: 'active', rewardMaturityPercent: 100 } }]]);
  const blockchain = { getAddressStats: (address) => states.get(address) || { balanceMicro: '0', participant: null } };
  const community = {
    domain: 'community.sparge.test',
    challenge: { expiresSeconds: 600 },
    privacy: {
      publicProfilesDefault: false,
      publicDiscordNameDefault: false,
      publicBadgesDefault: false,
      publicWalletVerifiedDefault: false,
      publicParticipantStatusDefault: false,
      publicObserverStatusDefault: false,
      publicBalanceDefault: false
    },
    roleSync: { enabled: true, intervalSeconds: 300 },
    discord: {
      roles: {
        verifiedWallet: 'role-verified',
        participant: 'role-participant',
        matureParticipant: 'role-mature',
        observerOperator: 'role-observer',
        publicObserver: 'role-public-observer',
        builder: 'role-builder',
        earlyAlpha: 'role-alpha'
      }
    }
  };
  const logger = { info() {}, warn() {}, error() {} };
  const roleSync = new RoleSyncService({ repository, bot, blockchain, config: community, logger, now: () => now });
  const service = new IdentityService({ repository, blockchain, roleSync, config: { chainId: 'sparge-mainnet', community }, logger, now: () => now });
  const session = { discordUserId: '123456789012345678', discordDisplayName: '<b>Michi</b>' };

  const challenge = service.createChallenge(session.discordUserId, first.address);
  assert.ok(challenge.challenge.includes('Chain ID: sparge-mainnet'));
  assert.ok(challenge.challenge.includes('Domain: community.sparge.test'));
  assert.ok(challenge.challenge.includes(`Discord User ID: ${session.discordUserId}`));
  assert.ok(challenge.challenge.includes(`Wallet Address: ${first.address}`));
  assert.ok(!JSON.stringify(repository.getChallenge(challenge.challengeId)).includes(challenge.challenge), 'repository stores a challenge hash, not canonical text');
  const signatureHex = signCanonicalMessage(challenge.challenge, first.privateKeyHex, first.publicKeyHex);
  const linked = await service.verifyAndLink({
    session,
    challengeId: challenge.challengeId,
    challenge: challenge.challenge,
    walletAddress: first.address,
    publicKeyHex: first.publicKeyHex,
    signatureHex
  });
  assert.strictEqual(linked.identity.walletAddress, first.address);
  assert.deepStrictEqual(new Set(linked.identity.roles.map((role) => role.key)), new Set(['verifiedWallet', 'participant', 'matureParticipant']));
  assert.ok(bot.members.get(session.discordUserId).has('unrelated-role'), 'unrelated Discord role remains');
  assert.ok(!bot.members.get(session.discordUserId).has('role-builder'), 'Builder is not inferred automatically');
  assert.ok(!bot.members.get(session.discordUserId).has('role-observer'), 'Observer role is not granted without proof');
  assert.strictEqual(service.publicProfile(first.address), null, 'public profile defaults off');

  await expectCode(service.verifyAndLink({ session, challengeId: challenge.challengeId, challenge: challenge.challenge, walletAddress: first.address, publicKeyHex: first.publicKeyHex, signatureHex }), 'CHALLENGE_ALREADY_USED');

  const wrongKeyChallenge = service.createChallenge(session.discordUserId, first.address);
  const wrongSignature = signCanonicalMessage(wrongKeyChallenge.challenge, second.privateKeyHex, second.publicKeyHex);
  await expectCode(service.verifyAndLink({ session, challengeId: wrongKeyChallenge.challengeId, challenge: wrongKeyChallenge.challenge, walletAddress: first.address, publicKeyHex: second.publicKeyHex, signatureHex: wrongSignature }), 'WALLET_KEY_MISMATCH');

  const changedChallenge = service.createChallenge(session.discordUserId, second.address);
  const changedText = changedChallenge.challenge.replace('Chain ID: sparge-mainnet', 'Chain ID: wrong-chain');
  const changedSignature = signCanonicalMessage(changedText, second.privateKeyHex, second.publicKeyHex);
  await expectCode(service.verifyAndLink({ session, challengeId: changedChallenge.challengeId, challenge: changedText, walletAddress: second.address, publicKeyHex: second.publicKeyHex, signatureHex: changedSignature }), 'CHALLENGE_MISMATCH');

  const expired = service.createChallenge(session.discordUserId, second.address);
  now += 601000;
  const expiredSignature = signCanonicalMessage(expired.challenge, second.privateKeyHex, second.publicKeyHex);
  await expectCode(service.verifyAndLink({ session, challengeId: expired.challengeId, challenge: expired.challenge, walletAddress: second.address, publicKeyHex: second.publicKeyHex, signatureHex: expiredSignature }), 'CHALLENGE_EXPIRED');

  now += 1;
  const hostileSession = { discordUserId: '223456789012345678', discordDisplayName: 'Other' };
  const hostile = service.createChallenge(hostileSession.discordUserId, first.address);
  const hostileSignature = signCanonicalMessage(hostile.challenge, first.privateKeyHex, first.publicKeyHex);
  await expectCode(service.verifyAndLink({ session: hostileSession, challengeId: hostile.challengeId, challenge: hostile.challenge, walletAddress: first.address, publicKeyHex: first.publicKeyHex, signatureHex: hostileSignature }), 'WALLET_ALREADY_LINKED');

  const privacy = {
    publicProfileEnabled: true,
    publicDiscordNameEnabled: true,
    publicBadgesEnabled: true,
    publicWalletVerifiedEnabled: true,
    publicParticipantStatusEnabled: true,
    publicObserverStatusEnabled: false,
    publicBalanceEnabled: false
  };
  service.updatePrivacy(session.discordUserId, privacy);
  const profile = service.publicProfile(first.address);
  assert.strictEqual(profile.balanceMicro, null, 'balance remains private');
  assert.strictEqual(profile.participantStatus, 'active');
  assert.ok(!JSON.stringify(profile).includes(session.discordUserId), 'public API does not expose Discord user ID');

  const previousAdds = bot.adds.length;
  await service.sync(session.discordUserId);
  assert.strictEqual(bot.adds.length, previousAdds, 'role sync is idempotent');
  states.set(first.address, { balanceMicro: '1000', participant: { status: 'inactive', rewardMaturityPercent: 100 } });
  await service.sync(session.discordUserId);
  assert.ok(!bot.members.get(session.discordUserId).has('role-participant'));
  assert.ok(!bot.members.get(session.discordUserId).has('role-mature'));
  assert.ok(bot.members.get(session.discordUserId).has('role-verified'));

  await service.unlink(session.discordUserId);
  assert.deepStrictEqual([...bot.members.get(session.discordUserId)], ['unrelated-role'], 'unlink removes only Sparge-managed roles');
  assert.strictEqual(service.publicProfile(first.address), null, 'unlink removes public profile');
  const relink = service.createChallenge(session.discordUserId, first.address);
  const relinkSignature = signCanonicalMessage(relink.challenge, first.privateKeyHex, first.publicKeyHex);
  const relinked = await service.verifyAndLink({ session, challengeId: relink.challengeId, challenge: relink.challenge, walletAddress: first.address, publicKeyHex: first.publicKeyHex, signatureHex: relinkSignature });
  assert.strictEqual(relinked.identity.walletAddress, first.address, 'fresh proof can relink a released wallet');
  repository.close();
}

async function testOAuthRoutes() {
  const community = {
    enabled: true,
    publicBaseUrl: 'https://community.sparge.test/',
    sessions: { expiresSeconds: 1800 },
    roleSync: { enabled: true },
    challenge: { expiresSeconds: 600 }
  };
  const sessions = new CommunitySessions(community);
  let authenticateCalls = 0;
  const oauth = {
    authorizationUrl(state) { return `https://discord.test/oauth?state=${encodeURIComponent(state)}`; },
    async authenticate(code) { authenticateCalls += 1; assert.strictEqual(code, 'valid-code'); return { id: '123456789012345678', displayName: 'Michi' }; }
  };
  const identityService = {
    getForDiscord() { return null; },
    createChallenge(discordUserId, walletAddress) { return { challengeId: crypto.randomUUID(), challenge: `${discordUserId}:${walletAddress}` }; }
  };
  const logger = { info() {}, warn() {} };
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/community', communityRouter({ config: { communityIdentity: community }, sessions, oauth, identityService, logger }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = await fetch(`${base}/api/community/discord/start`, { redirect: 'manual' });
    assert.strictEqual(start.status, 302);
    const firstCookie = start.headers.get('set-cookie').split(';')[0];
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    assert.ok(state && !start.headers.get('location').includes('token'));

    const mismatch = await fetch(`${base}/api/community/discord/callback?code=valid-code&state=wrong`, { headers: { Cookie: firstCookie }, redirect: 'manual' });
    assert.ok(mismatch.headers.get('location').includes('oauth-invalid'));
    assert.strictEqual(authenticateCalls, 0, 'mismatched OAuth state is rejected before token exchange');

    const secondStart = await fetch(`${base}/api/community/discord/start`, { headers: { Cookie: firstCookie }, redirect: 'manual' });
    const secondState = new URL(secondStart.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${base}/api/community/discord/callback?code=valid-code&state=${encodeURIComponent(secondState)}`, { headers: { Cookie: firstCookie }, redirect: 'manual' });
    assert.strictEqual(callback.status, 302);
    assert.ok(callback.headers.get('location').includes('discord-connected'));
    const rotatedCookie = callback.headers.get('set-cookie').split(';')[0];
    assert.notStrictEqual(rotatedCookie, firstCookie, 'OAuth login rotates the session');
    assert.ok(!callback.headers.get('location').includes('token'), 'OAuth token is not exposed to browser');

    const reused = await fetch(`${base}/api/community/discord/callback?code=valid-code&state=${encodeURIComponent(secondState)}`, { headers: { Cookie: firstCookie }, redirect: 'manual' });
    assert.ok(reused.headers.get('location').includes('oauth-expired'), 'reused state is rejected');

    const me = await fetch(`${base}/api/community/me`, { headers: { Cookie: rotatedCookie } }).then((res) => res.json());
    assert.strictEqual(me.discordConnected, true);
    assert.ok(me.csrfToken);
    assert.ok(!JSON.stringify(me).includes('123456789012345678'), 'private Discord ID is not returned by me endpoint');

    const noCsrf = await fetch(`${base}/api/community/challenge`, {
      method: 'POST', headers: { Cookie: rotatedCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: wallet().address })
    });
    assert.strictEqual(noCsrf.status, 403, 'state-changing request requires CSRF');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function testConfigurationAndUi() {
  const disabled = { storage: { backend: 'sqlite' } };
  normalizeCommunityIdentityConfig(disabled);
  assert.strictEqual(disabled.communityIdentity.enabled, false);
  assert.strictEqual(disabled.communityIdentity.privacy.publicProfilesDefault, false);
  const savedClientSecret = process.env.DISCORD_CLIENT_SECRET;
  const savedBotToken = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_CLIENT_SECRET = '';
  process.env.DISCORD_BOT_TOKEN = '';
  assert.throws(() => normalizeCommunityIdentityConfig({
    storage: { backend: 'sqlite' },
    communityIdentity: {
      enabled: true,
      publicBaseUrl: 'http://localhost:3051',
      discord: {
        clientId: '123456789012345678',
        guildId: '223456789012345678',
        oauthRedirectUri: 'http://localhost:3051/api/community/discord/callback',
        roles: { verifiedWallet: '323456789012345678' }
      }
    }
  }), /DISCORD_CLIENT_SECRET/, 'enabled integration fails closed without secrets');
  if (savedClientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
  else process.env.DISCORD_CLIENT_SECRET = savedClientSecret;
  if (savedBotToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
  else process.env.DISCORD_BOT_TOKEN = savedBotToken;

  const redacted = redact({ botToken: 'secret', accessToken: 'oauth', signatureHex: 'signed', safe: 'ok' });
  assert.strictEqual(redacted.botToken, '[REDACTED]');
  assert.strictEqual(redacted.accessToken, '[REDACTED]');
  assert.strictEqual(redacted.signatureHex, '[REDACTED]');

  const walletHtml = fs.readFileSync(path.join(root, 'public', 'wallet.html'), 'utf8');
  const addressHtml = fs.readFileSync(path.join(root, 'public', 'address.html'), 'utf8');
  const observerHtml = fs.readFileSync(path.join(root, 'public', 'observer-index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  const serverIndex = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
  const caddyfile = fs.readFileSync(path.join(root, 'Caddyfile'), 'utf8');
  assert.ok(walletHtml.includes('data-tab="community"'));
  assert.ok(walletHtml.includes('Exact message to sign'));
  assert.ok(walletHtml.includes('Sign Verification Message'));
  assert.ok(walletHtml.includes('costs no SPRG'));
  assert.ok(addressHtml.includes('addressCommunityProfile'));
  assert.ok(observerHtml.includes('Open Identity Page'));
  assert.ok(appJs.includes("communitySignChallengeBtn?.addEventListener('click', signCommunityChallenge)"), 'wallet never auto-signs');
  assert.ok(appJs.includes('me.identity.lastRoleSyncAt ? formatRelativeTime(me.identity.lastRoleSyncAt)'), 'role sync timestamp uses the existing relative-time formatter');
  assert.ok(!appJs.includes('timeAgo(me.identity.lastRoleSyncAt)'), 'community rendering does not call an undefined formatter');
  assert.ok(appJs.includes('content.textContent = value'), 'public profile display values are inserted safely');
  assert.ok(preload.includes('openCommunityIdentity'));
  assert.ok(serverIndex.includes('bodyLimits.community'), 'community endpoint uses a dedicated request-size limit');
  assert.ok(serverIndex.includes('rateLimits.communityVerify'), 'community verification uses endpoint-specific rate limiting');
  assert.ok(caddyfile.includes('log_skip @discordOAuthCallback'), 'OAuth callback codes are excluded from proxy access logs');
}

(async () => {
  try {
    await testIdentityCore();
    await testOAuthRoutes();
    testConfigurationAndUi();
    console.log('Community identity tests passed.');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
