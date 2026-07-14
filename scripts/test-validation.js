const assert = require('assert');
const { runValidation } = require('../server/lib/validation/middleware');
const {
  addressParams,
  txidParams,
  blocksQuery,
  observerListQuery,
  signedTxBody,
  heartbeatBody,
  observerSettingsBody
} = require('../server/lib/validation/schemas');
const { ValidationError, validationErrorHandler } = require('../server/lib/validation/errors');

const address = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const txBase = {
  type: 'transfer',
  chainId: 'sparge-mainnet',
  from: address,
  to: 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd',
  amountMicro: '1',
  feeMicro: '1000',
  nonce: '0',
  publicKeyHex: 'a'.repeat(64),
  signatureHex: 'b'.repeat(128),
  sponsor: '',
  participant: '',
  memo: ''
};

function expectValid(schema, value, label) {
  assert.doesNotThrow(() => runValidation(schema, value), label);
}

function expectInvalid(schema, value, field, label) {
  assert.throws(() => runValidation(schema, value), (err) => (
    err
      && err.code === 'VALIDATION_ERROR'
      && err.details.some((detail) => detail.field === field)
  ), label);
}

function validationResponse(error) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(this);
      }
    };
    validationErrorHandler(error, {}, res, reject);
  });
}

(async () => {
  expectValid(addressParams, { addr: address }, 'valid address param passes');
  expectInvalid(addressParams, { addr: ' spg_bad ' }, 'addr', 'malformed address fails');
  expectInvalid(txidParams, { txid: 'A'.repeat(64) }, 'txid', 'uppercase tx hash fails');
  expectInvalid(txidParams, { txid: 'a'.repeat(63) }, 'txid', 'short transaction hash fails');
  expectInvalid(txidParams, { txid: 'a'.repeat(65) }, 'txid', 'long transaction hash fails');

  assert.deepStrictEqual(runValidation(blocksQuery, {}), { page: 1, limit: 10 }, 'block pagination defaults');
  assert.deepStrictEqual(runValidation(blocksQuery, { fromHeight: '0', limit: '200' }), { fromHeight: 0, limit: 200 }, 'sync query max passes');
  expectInvalid(blocksQuery, { page: '-1' }, 'page', 'negative page rejected');
  expectInvalid(blocksQuery, { page: '1.5' }, 'page', 'float page rejected');
  expectInvalid(blocksQuery, { limit: '51' }, 'limit', 'block listing limit above cap rejected');
  expectInvalid(blocksQuery, { fromHeight: '0', sort: 'height desc' }, 'sort', 'unknown query field rejected');

  assert.deepStrictEqual(runValidation(observerListQuery, { page: '2', limit: '100', status: 'syncing', country: 'be', version: '1.0.0' }), {
    page: 2,
    limit: 100,
    status: 'syncing',
    version: '1.0.0',
    country: 'BE'
  }, 'observer query normalizes country');
  expectInvalid(observerListQuery, { status: 'online' }, 'status', 'observer status allowlist enforced');
  expectInvalid(observerListQuery, { limit: '101' }, 'limit', 'observer limit cap enforced');

  expectValid(signedTxBody, txBase, 'valid signed transfer schema passes');
  expectInvalid(signedTxBody, { ...txBase, chainId: 'Sparge Mainnet' }, 'chainId', 'malformed chain ID rejected');
  expectInvalid(signedTxBody, { ...txBase, publicKeyHex: 'g'.repeat(64) }, 'publicKeyHex', 'malformed public key rejected');
  expectInvalid(signedTxBody, { ...txBase, signatureHex: 'b'.repeat(126) }, 'signatureHex', 'malformed signature rejected');
  expectInvalid(signedTxBody, { ...txBase, to: 'spg_bad' }, 'to', 'invalid recipient rejected');
  expectInvalid(signedTxBody, { ...txBase, nonce: '-1' }, 'nonce', 'negative nonce rejected');
  expectInvalid(signedTxBody, { ...txBase, nonce: '1.5' }, 'nonce', 'floating nonce rejected');
  expectInvalid(signedTxBody, { ...txBase, nonce: String(Number.MAX_SAFE_INTEGER + 1) }, 'nonce', 'unsafe nonce rejected');
  expectInvalid(signedTxBody, { ...txBase, amountMicro: '-1' }, 'amountMicro', 'negative amount rejected');
  expectInvalid(signedTxBody, { ...txBase, amountMicro: '0' }, 'amountMicro', 'zero transfer amount rejected');
  expectInvalid(signedTxBody, { ...txBase, amountMicro: '1e3' }, 'amountMicro', 'malformed amount rejected');
  expectInvalid(signedTxBody, { ...txBase, memo: 'x'.repeat(129) }, 'memo', 'oversized memo rejected');
  expectInvalid(signedTxBody, { ...txBase, extra: 'nope' }, 'extra', 'extra transaction field rejected');
  expectInvalid(signedTxBody, { ...txBase, type: 'heartbeat', to: txBase.to, amountMicro: '1' }, 'to', 'wrong heartbeat fields rejected');
  expectInvalid(signedTxBody, { ...txBase, type: 'stake' }, 'type', 'invalid transaction type rejected');

  const privateHeartbeat = {
    nodeId: 'obs_test_node_0001',
    nodeMode: 'observer',
    version: '1.0.0',
    height: 42,
    latestHash: 'c'.repeat(64),
    publicListingEnabled: false,
    publicAlias: 'discard me',
    countryCode: 'BE'
  };
  assert.deepStrictEqual(runValidation(heartbeatBody, privateHeartbeat), {
    nodeId: 'obs_test_node_0001',
    nodeMode: 'observer',
    version: '1.0.0',
    height: 42,
    latestHash: 'c'.repeat(64),
    publicListingEnabled: false,
    publicAlias: '',
    countryCode: ''
  }, 'private heartbeat discards public fields');
  expectValid(heartbeatBody, { ...privateHeartbeat, publicListingEnabled: true, publicAlias: 'Belgium Node', countryCode: 'BE' }, 'valid public heartbeat passes');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, nodeId: '../bad' }, 'nodeId', 'bad node id rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, version: 'v'.repeat(33) }, 'version', 'bad version rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, height: -1 }, 'height', 'bad heartbeat height rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, latestHash: 'bad' }, 'latestHash', 'bad latest hash rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, publicListingEnabled: true, countryCode: 'ZZ' }, 'countryCode', 'bad country rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, publicListingEnabled: true, publicAlias: '<script>' }, 'publicAlias', 'markup alias rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, hostname: 'desktop' }, 'hostname', 'hostname field rejected');
  expectInvalid(heartbeatBody, { ...privateHeartbeat, unknown: true }, 'unknown', 'unknown heartbeat field rejected');

  expectValid(observerSettingsBody, { publicListingEnabled: false, publicAlias: '', countryCode: '' }, 'valid observer settings pass');
  expectInvalid(observerSettingsBody, { publicListingEnabled: false, publicAlias: '', countryCode: '', username: 'me' }, 'username', 'unknown settings field rejected');

  const response = await validationResponse(new ValidationError([{ field: 'secret', reason: 'Bad value' }]));
  assert.strictEqual(response.statusCode, 400, 'structured validation response status');
  assert.strictEqual(response.body.error, 'VALIDATION_ERROR', 'structured validation response error code');
  assert.ok(!JSON.stringify(response.body).includes(process.cwd()), 'validation response has no file paths');
  assert.ok(!JSON.stringify(response.body).includes('amountMicro'), 'rejected payload is not echoed');

  console.log('validation tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
