const crypto = require('crypto');
const bs58 = require('bs58');

function sha256Bytes(input) {
  return crypto.createHash('sha256').update(input).digest();
}

function sha256Hex(input) {
  return sha256Bytes(input).toString('hex');
}

function isHex(value, length) {
  if (typeof value !== 'string') return false;
  if (!/^[0-9a-fA-F]+$/.test(value)) return false;
  if (value.length % 2 !== 0) return false;
  if (length && value.length !== length) return false;
  return true;
}

function parseBigIntField(value, field) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) {
      throw new Error(`${field} must be a non-negative integer string`);
    }
    return BigInt(value);
  }
  throw new Error(`${field} must be a non-negative integer string`);
}

function base64UrlToBuffer(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function bufferToBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function deriveAddress(publicKeyHex) {
  if (!isHex(publicKeyHex, 64)) {
    throw new Error('publicKeyHex must be 64 hex chars');
  }
  const pubKeyBytes = Buffer.from(publicKeyHex, 'hex');
  const hash = sha256Bytes(pubKeyBytes);
  const addressBytes = hash.subarray(0, 20);
  return `spg_${bs58.encode(addressBytes)}`;
}

function buildMessage(tx) {
  const memo = typeof tx.memo === 'string' ? tx.memo : '';
  const base = [
    tx.type,
    tx.chainId,
    tx.from,
    tx.to,
    tx.amountMicro,
    tx.feeMicro,
    tx.nonce,
    tx.publicKeyHex,
    tx.sponsor || '',
    tx.participant || ''
  ].join('|');
  if (memo.length > 0) {
    return `${base}|${memo}`;
  }
  return base;
}

function createTxId(tx) {
  const message = buildMessage(tx);
  return sha256Hex(Buffer.from(message, 'utf8'));
}

function getKeyObjectsFromPublicHex(publicKeyHex) {
  if (!isHex(publicKeyHex, 64)) {
    throw new Error('publicKeyHex must be 64 hex chars');
  }
  const x = bufferToBase64Url(Buffer.from(publicKeyHex, 'hex'));
  const jwk = { kty: 'OKP', crv: 'Ed25519', x };
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function getKeyObjectsFromPrivateHex(privateKeyHex, publicKeyHex) {
  if (!isHex(privateKeyHex, 64)) {
    throw new Error('privateKeyHex must be 64 hex chars');
  }
  if (!isHex(publicKeyHex, 64)) {
    throw new Error('publicKeyHex must be 64 hex chars');
  }
  const d = bufferToBase64Url(Buffer.from(privateKeyHex, 'hex'));
  const x = bufferToBase64Url(Buffer.from(publicKeyHex, 'hex'));
  const jwk = { kty: 'OKP', crv: 'Ed25519', x, d };
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

function signMessage(tx, privateKeyHex) {
  const message = buildMessage(tx);
  return signCanonicalMessage(message, privateKeyHex, tx.publicKeyHex);
}

function verifySignature(tx) {
  const message = buildMessage(tx);
  return verifyCanonicalMessage(message, tx.publicKeyHex, tx.signatureHex);
}

function signCanonicalMessage(message, privateKeyHex, publicKeyHex) {
  const digest = sha256Bytes(Buffer.from(message, 'utf8'));
  const key = getKeyObjectsFromPrivateHex(privateKeyHex, publicKeyHex);
  return crypto.sign(null, digest, key).toString('hex');
}

function verifyCanonicalMessage(message, publicKeyHex, signatureHex) {
  if (!isHex(signatureHex, 128)) return false;
  const digest = sha256Bytes(Buffer.from(message, 'utf8'));
  const signatureBytes = Buffer.from(signatureHex, 'hex');
  const key = getKeyObjectsFromPublicHex(publicKeyHex);
  return crypto.verify(null, digest, key, signatureBytes);
}

function normalizeTxInput(input) {
  const tx = {
    type: typeof input.type === 'string' ? input.type : '',
    from: typeof input.from === 'string' ? input.from : '',
    to: typeof input.to === 'string' ? input.to : '',
    chainId: typeof input.chainId === 'string' ? input.chainId : '',
    publicKeyHex: typeof input.publicKeyHex === 'string' ? input.publicKeyHex : '',
    signatureHex: typeof input.signatureHex === 'string' ? input.signatureHex : '',
    memo: typeof input.memo === 'string' ? input.memo : '',
    sponsor: typeof input.sponsor === 'string' ? input.sponsor : '',
    participant: typeof input.participant === 'string' ? input.participant : ''
  };

  tx.amountMicro = parseBigIntField(input.amountMicro ?? '0', 'amountMicro').toString();
  tx.feeMicro = parseBigIntField(input.feeMicro ?? '0', 'feeMicro').toString();
  tx.nonce = parseBigIntField(input.nonce ?? '0', 'nonce').toString();
  return tx;
}

module.exports = {
  sha256Bytes,
  sha256Hex,
  isHex,
  parseBigIntField,
  base64UrlToBuffer,
  bufferToBase64Url,
  deriveAddress,
  buildMessage,
  createTxId,
  signMessage,
  verifySignature,
  signCanonicalMessage,
  verifyCanonicalMessage,
  getKeyObjectsFromPublicHex,
  getKeyObjectsFromPrivateHex,
  normalizeTxInput
};
