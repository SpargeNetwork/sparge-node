const assert = require('assert');
const http = require('http');
const express = require('express');
const {
  createRateLimiter,
  createConcurrencyLimiter,
  normalizeRateLimitConfig
} = require('../server/lib/httpSecurity');
const { createJsonBodyParser } = require('../server/lib/requestSize');
const { validateBody } = require('../server/lib/validation/middleware');
const { heartbeatBody, signedTxBody, addressTxsQuery } = require('../server/lib/validation/schemas');
const { validationErrorHandler } = require('../server/lib/validation/errors');
const { requestSizeErrorHandler } = require('../server/lib/requestSize');

const address = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const invalidTx = {
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
  nodeId: 'obs_rate_node_0001',
  nodeMode: 'observer',
  version: '1.0.0',
  height: 1,
  latestHash: 'c'.repeat(64),
  publicListingEnabled: false,
  publicAlias: '',
  countryCode: ''
};

function request(port, method, path, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function jsonPost(port, path, payload, headers = {}) {
  const body = JSON.stringify(payload);
  return request(port, 'POST', path, body, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
}

function startApp({ trustProxy = false } = {}) {
  const app = express();
  app.set('trust proxy', trustProxy);
  const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
  const globalLimiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyFn: ipKey, group: 'global-test' });
  app.use('/api/global', globalLimiter);
  app.get('/api/global/status', (req, res) => res.json({ ok: true }));

  app.use('/api/tx', createRateLimiter({ windowSeconds: 60, maxRequestsPerIp: 2, keyFn: ipKey, group: 'tx-test' }));
  app.use('/api/tx', createConcurrencyLimiter({ maxConcurrentPerIp: 3, keyFn: ipKey, group: 'tx-concurrency-test' }));
  app.use('/api/tx', createJsonBodyParser(16384));
  app.post('/api/tx', validateBody(signedTxBody), (req, res) => res.status(400).json({ error: 'invalid signature' }));

  app.use('/api/slow-tx', createConcurrencyLimiter({ maxConcurrentPerIp: 3, keyFn: ipKey, group: 'slow-tx-test' }));
  app.post('/api/slow-tx', (req, res) => setTimeout(() => res.json({ ok: true }), 120));

  app.use('/api/network/heartbeat', createRateLimiter({ windowSeconds: 60, maxRequestsPerIp: 3, keyFn: ipKey, group: 'hb-ip-test' }));
  app.use('/api/network/heartbeat', createJsonBodyParser(4096));
  app.post('/api/network/heartbeat', validateBody(heartbeatBody), createRateLimiter({
    windowSeconds: 60,
    max: 2,
    keyFn: (req) => req.body.nodeId,
    group: 'hb-node-test'
  }), (req, res) => res.json({ ok: true }));

  app.use('/api/address/:addr/txs', createRateLimiter({ windowSeconds: 60, maxRequestsPerIp: 1, keyFn: ipKey, group: 'address-history-test' }));
  app.get('/api/address/:addr/txs', (req, res, next) => {
    const parsed = addressTxsQuery(req.query);
    if (!parsed.ok) {
      const { ValidationError } = require('../server/lib/validation/errors');
      next(new ValidationError(parsed.details));
      return;
    }
    res.json({ ok: true });
  });

  app.use('/api', requestSizeErrorHandler);
  app.use('/api', validationErrorHandler);
  const server = app.listen(0);
  return new Promise((resolve) => server.on('listening', () => resolve({ server, port: server.address().port })));
}

(async () => {
  const { server, port } = await startApp();
  try {
    assert.strictEqual((await request(port, 'GET', '/api/global/status')).statusCode, 200, 'global below limit succeeds');
    assert.strictEqual((await request(port, 'GET', '/api/global/status')).statusCode, 200);
    assert.strictEqual((await request(port, 'GET', '/api/global/status')).statusCode, 200);
    const globalLimited = await request(port, 'GET', '/api/global/status');
    assert.strictEqual(globalLimited.statusCode, 429, 'global over limit returns 429');
    assert.strictEqual(globalLimited.body.error, 'RATE_LIMITED', 'standard 429 JSON');
    assert.ok(globalLimited.headers['retry-after'], 'Retry-After header exists');
    assert.ok(globalLimited.headers['ratelimit-limit'], 'standard rate limit header exists');
    assert.ok(!globalLimited.raw.includes(process.cwd()), '429 has no stack trace/path');

    const tx1 = await jsonPost(port, '/api/tx', invalidTx);
    assert.strictEqual(tx1.statusCode, 400, 'first invalid tx reaches existing validation');
    const tx2 = await jsonPost(port, '/api/tx', { ...invalidTx, publicKeyHex: 'g'.repeat(64) });
    assert.strictEqual(tx2.statusCode, 400, 'schema-invalid tx consumes limit');
    const tx3 = await jsonPost(port, '/api/tx', invalidTx);
    assert.strictEqual(tx3.statusCode, 429, 'tx above per-IP limit returns 429 before signature logic');
    assert.ok(!JSON.stringify(tx3.body).includes(invalidTx.signatureHex), '429 does not expose payload');

    const slow = await Promise.all([
      request(port, 'POST', '/api/slow-tx'),
      request(port, 'POST', '/api/slow-tx'),
      request(port, 'POST', '/api/slow-tx'),
      request(port, 'POST', '/api/slow-tx')
    ]);
    assert.strictEqual(slow.filter((r) => r.statusCode === 429).length, 1, 'fourth concurrent tx is rejected');
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.strictEqual((await request(port, 'POST', '/api/slow-tx')).statusCode, 200, 'concurrency counter releases after success');

    assert.strictEqual((await jsonPost(port, '/api/network/heartbeat', heartbeat)).statusCode, 200, 'valid heartbeat succeeds');
    assert.strictEqual((await jsonPost(port, '/api/network/heartbeat', { ...heartbeat, nodeId: 'obs_rate_node_0002' })).statusCode, 200, 'different node ID succeeds independently');
    assert.strictEqual((await jsonPost(port, '/api/network/heartbeat', heartbeat)).statusCode, 200, 'second same node heartbeat succeeds');
    const nodeLimited = await jsonPost(port, '/api/network/heartbeat', heartbeat);
    assert.strictEqual(nodeLimited.statusCode, 429, 'per-nodeId heartbeat limit works');
    assert.ok(!JSON.stringify(nodeLimited.body).includes(heartbeat.nodeId), 'nodeId is not exposed in 429 response');

    const hbIpLimited = await jsonPost(port, '/api/network/heartbeat', { ...heartbeat, nodeId: '../bad', extra: 'x' });
    assert.strictEqual(hbIpLimited.statusCode, 429, 'malformed heartbeat still consumes per-IP limit before node limiter');

    assert.strictEqual((await request(port, 'GET', `/api/address/${address}/txs?limit=1`)).statusCode, 200, 'address history first request succeeds');
    const historyLimited = await request(port, 'GET', `/api/address/${address}/txs?limit=1`);
    assert.strictEqual(historyLimited.statusCode, 429, 'address history uses stricter limiter');

    const oversizedFresh = await startApp();
    try {
      const huge = await jsonPost(oversizedFresh.port, '/api/tx', { ...invalidTx, memo: 'x'.repeat(17000) });
      assert.strictEqual(huge.statusCode, 413, 'fresh oversized payload returns 413 before validation');
    } finally {
      oversizedFresh.server.close();
    }
  } finally {
    server.close();
  }

  const spoofed = await startApp({ trustProxy: false });
  try {
    assert.strictEqual((await request(spoofed.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '1.1.1.1' })).statusCode, 200);
    assert.strictEqual((await request(spoofed.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '2.2.2.2' })).statusCode, 200);
    assert.strictEqual((await request(spoofed.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '3.3.3.3' })).statusCode, 200);
    assert.strictEqual((await request(spoofed.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '4.4.4.4' })).statusCode, 429, 'spoofed X-Forwarded-For does not bypass when trust proxy is false');
  } finally {
    spoofed.server.close();
  }

  const trusted = await startApp({ trustProxy: 1 });
  try {
    assert.strictEqual((await request(trusted.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '10.0.0.1' })).statusCode, 200);
    assert.strictEqual((await request(trusted.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '10.0.0.2' })).statusCode, 200);
    assert.strictEqual((await request(trusted.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '10.0.0.3' })).statusCode, 200);
    assert.strictEqual((await request(trusted.port, 'GET', '/api/global/status', '', { 'X-Forwarded-For': '10.0.0.4' })).statusCode, 200, 'configured trusted proxy uses forwarded client identity');
  } finally {
    trusted.server.close();
  }

  const cfg = normalizeRateLimitConfig({ security: { rateLimits: {} } });
  assert.strictEqual(cfg.enabled, true, 'rate limits default enabled');
  assert.throws(() => normalizeRateLimitConfig({ security: { rateLimits: { enabled: 'yes' } } }), /enabled must be boolean/, 'invalid enabled rejected');
  assert.throws(() => normalizeRateLimitConfig({ security: { rateLimits: { global: { windowSeconds: 0 } } } }), /positive safe integer/, 'zero window rejected');
  assert.throws(() => normalizeRateLimitConfig({ security: { rateLimits: { transaction: { maxRequestsPerIp: -1 } } } }), /positive safe integer/, 'negative max rejected');

  console.log('rate-limit tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
