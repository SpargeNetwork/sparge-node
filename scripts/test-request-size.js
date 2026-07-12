const assert = require('assert');
const http = require('http');
const express = require('express');
const { validateBody } = require('../server/lib/validation/middleware');
const { signedTxBody, heartbeatBody, observerSettingsBody } = require('../server/lib/validation/schemas');
const {
  DEFAULT_LIMITS,
  normalizeSecurityConfig,
  createJsonBodyParser,
  requestSizeErrorHandler
} = require('../server/lib/requestSize');
const { validationErrorHandler } = require('../server/lib/validation/errors');

const address = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const tx = {
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
const heartbeat = {
  nodeId: 'obs_test_node_0001',
  nodeMode: 'observer',
  version: '1.0.0',
  height: 1,
  latestHash: 'c'.repeat(64),
  publicListingEnabled: false,
  publicAlias: '',
  countryCode: ''
};

function makePayloadBytes(bytes) {
  const prefix = '{"x":"';
  const suffix = '"}';
  return `${prefix}${'a'.repeat(bytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
}

function startApp() {
  const app = express();
  app.post('/api/json', createJsonBodyParser(64), (req, res) => res.json({ ok: true, bytes: Buffer.byteLength(JSON.stringify(req.body), 'utf8') }));
  app.post('/api/tx', createJsonBodyParser(DEFAULT_LIMITS.maxTransactionBodyBytes), validateBody(signedTxBody), (req, res) => res.json({ reached: true, type: req.body.type }));
  app.post('/api/network/heartbeat', createJsonBodyParser(DEFAULT_LIMITS.maxHeartbeatBodyBytes), validateBody(heartbeatBody), (req, res) => res.json({ ok: true }));
  app.post('/api/observer/settings', createJsonBodyParser(DEFAULT_LIMITS.maxObserverSettingsBodyBytes), validateBody(observerSettingsBody), (req, res) => res.json({ ok: true }));
  app.use('/api', requestSizeErrorHandler);
  app.use('/api', validationErrorHandler);
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.on('listening', () => resolve({ server, port: server.address().port }));
  });
}

function request(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch {}
        resolve({ statusCode: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

(async () => {
  const { server, port } = await startApp();
  try {
    const normal = await request(port, '/api/json', '{"ok":true}', {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength('{"ok":true}')
    });
    assert.strictEqual(normal.statusCode, 200, 'normal JSON succeeds');

    const exactBody = makePayloadBytes(64);
    const exact = await request(port, '/api/json', exactBody, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(exactBody)
    });
    assert.strictEqual(exact.statusCode, 200, 'body exactly at parser limit succeeds');

    const overBody = makePayloadBytes(65);
    const oneOver = await request(port, '/api/json', overBody, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(overBody)
    });
    assert.strictEqual(oneOver.statusCode, 413, 'body one byte over limit returns 413');
    assert.strictEqual(oneOver.body.error, 'PAYLOAD_TOO_LARGE');
    assert.ok(!oneOver.raw.includes(process.cwd()), 'oversized response has no stack trace or file path');
    assert.ok(!oneOver.raw.includes('aaaaa'), 'oversized response does not echo body');

    const huge = await request(port, '/api/json', makePayloadBytes(5000), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(huge.statusCode, 413, 'absent Content-Length is still parser-limited');

    const malformedHuge = await request(port, '/api/json', '{'.repeat(5000), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(malformedHuge.statusCode, 413, 'malformed oversized JSON returns 413');

    const contentType = await request(port, '/api/json', '{"ok":true}', {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength('{"ok":true}')
    });
    assert.strictEqual(contentType.statusCode, 415, 'unsupported content type is rejected');

    const compressed = await request(port, '/api/json', '{"ok":true}', {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Content-Length': Buffer.byteLength('{"ok":true}')
    });
    assert.strictEqual(compressed.statusCode, 415, 'encoded JSON body is rejected');

    const badLength = await request(port, '/api/json', '{"ok":true}', {
      'Content-Type': 'application/json',
      'Content-Length': '-1'
    });
    assert.strictEqual(badLength.statusCode, 400, 'malformed Content-Length is rejected');

    const txOk = await request(port, '/api/tx', JSON.stringify(tx), {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(tx))
    });
    assert.strictEqual(txOk.statusCode, 200, 'normal signed transaction body reaches route after schema validation');
    assert.strictEqual(txOk.body.reached, true);

    const txOversized = await request(port, '/api/tx', JSON.stringify({ ...tx, memo: 'x'.repeat(17000) }), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(txOversized.statusCode, 413, 'oversized transaction body returns 413');

    const memoOversized = await request(port, '/api/tx', JSON.stringify({ ...tx, memo: 'é'.repeat(65) }), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(memoOversized.statusCode, 400, 'multibyte UTF-8 memo byte cap is enforced by schema');
    assert.strictEqual(memoOversized.body.error, 'VALIDATION_ERROR');

    const hbOk = await request(port, '/api/network/heartbeat', JSON.stringify(heartbeat), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(hbOk.statusCode, 200, 'valid private heartbeat succeeds');

    const hbOversized = await request(port, '/api/network/heartbeat', JSON.stringify({ ...heartbeat, nodeId: 'obs_' + 'x'.repeat(5000) }), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(hbOversized.statusCode, 413, 'oversized heartbeat body returns 413');

    const aliasOversized = await request(port, '/api/network/heartbeat', JSON.stringify({
      ...heartbeat,
      publicListingEnabled: true,
      publicAlias: 'é'.repeat(41),
      countryCode: 'BE'
    }), { 'Content-Type': 'application/json' });
    assert.strictEqual(aliasOversized.statusCode, 400, 'oversized alias byte length is rejected');

    const settingsOk = await request(port, '/api/observer/settings', JSON.stringify({ publicListingEnabled: false, publicAlias: '', countryCode: '' }), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(settingsOk.statusCode, 200, 'valid observer settings request succeeds');

    const settingsOversized = await request(port, '/api/observer/settings', JSON.stringify({ publicListingEnabled: true, publicAlias: 'x'.repeat(5000), countryCode: 'BE' }), {
      'Content-Type': 'application/json'
    });
    assert.strictEqual(settingsOversized.statusCode, 413, 'oversized observer settings body returns 413');

    const cfg = normalizeSecurityConfig({ security: {} });
    assert.deepStrictEqual(cfg, DEFAULT_LIMITS, 'default request-size config loads');
    assert.throws(() => normalizeSecurityConfig({ security: { maxJsonBodyBytes: 0 } }), /positive safe integer/, 'zero config limit rejected');
    assert.throws(() => normalizeSecurityConfig({ security: { maxJsonBodyBytes: -1 } }), /positive safe integer/, 'negative config limit rejected');
    assert.throws(() => normalizeSecurityConfig({ security: { maxJsonBodyBytes: 999999999 } }), /between/, 'extremely large config limit rejected');

    console.log('request-size tests passed');
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
