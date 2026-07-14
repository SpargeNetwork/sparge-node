const crypto = require('crypto');

const CHALLENGE_VERSION = 1;
const CHALLENGE_ACTION = 'link_discord_wallet';

function canonicalWalletChallenge(fields) {
  return [
    'Sparge Community Identity Link',
    '',
    `Version: ${CHALLENGE_VERSION}`,
    `Action: ${CHALLENGE_ACTION}`,
    `Chain ID: ${fields.chainId}`,
    `Domain: ${fields.domain}`,
    `Discord User ID: ${fields.discordUserId}`,
    `Wallet Address: ${fields.walletAddress}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
    `Expires At: ${fields.expiresAt}`,
    'Signature Scheme: sparge-ed25519-sha256-v1'
  ].join('\n');
}

function challengeHash(challenge) {
  return crypto.createHash('sha256').update(Buffer.from(challenge, 'utf8')).digest('hex');
}

function createWalletChallenge({ chainId, domain, discordUserId, walletAddress, expiresSeconds, now = Date.now() }) {
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + expiresSeconds * 1000).toISOString();
  const nonce = crypto.randomBytes(32).toString('base64url');
  const challengeId = crypto.randomUUID();
  const challenge = canonicalWalletChallenge({ chainId, domain, discordUserId, walletAddress, nonce, issuedAt, expiresAt });
  return { challengeId, challenge, challengeHash: challengeHash(challenge), nonce, issuedAt, expiresAt };
}

module.exports = {
  CHALLENGE_VERSION,
  CHALLENGE_ACTION,
  canonicalWalletChallenge,
  challengeHash,
  createWalletChallenge
};
