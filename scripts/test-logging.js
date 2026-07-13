const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { createBlockchain } = require('../server/lib/blockchain');
const { createMempool } = require('../server/lib/mempool');
const { createRateLimiter } = require('../server/lib/httpSecurity');
const {
  createJsonBodyParser,
  requestSizeErrorHandler
} = require('../server/lib/requestSize');
const { JsonStorage } = require('../server/storage/jsonStorage');
const { rpcRouter } = require('../server/routes/rpc');
const { validationErrorHandler } = require('../server/lib/validation/errors');
const {
  createLogger,
  createRequestIdMiddleware,
  createHttpRequestLogger,
  normalizeLoggingConfig
} = require('../server/lib/logger');

const ADDRESS_A = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const ADDRESS_B = 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd';
const LONG_SECRET = 'b'.repeat(128);

function baseConfig(overrides = {}) {
  const config = {
    chain: {
      name: 'Sparge Test',
      symbol: 'SPG',
      chainId: 'sparge-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0',
      blockTimeSeconds: 2,
      genesisCreatedAt: '2026-01-01T00:00:00.000Z'
    },
    token: {
      decimals: 6,
      initialSupplyTokens: '1000'
    },
    mining: {
      proposerAddress: ADDRESS_A,
      genesisOperatorAddress: ADDRESS_A,
      genesisFreeBlocks: 10
    },
    rewards: {
      treasuryAddress: ADDRESS_A,
      nodePoolAddress: 'NODE_POOL',
      holderPoolAddress: 'HOLDER_POOL'
    },
    storage: {
      backend: 'json',
      blocksPerFile: 100
    },
    gas: {
      blockLimit: 510,
      targetRatioBps: 8000,
      baseFeeChangeDenominator: 8,
      baseFeeInitialMicro: '0',
      minBaseFeeMicro: '0'
    },
    tx: {
      minFeeMicro: '0'
    },
    mempool: {
      sort: 'fee',
      maxTransactions: 100,
      maxBytes: 1000000,
      maxTransactionsPerSender: 10,
      transactionTtlSeconds: 60,
      maxFutureNonceGap: 100,
      minimumFeeMicro: '0'
    },
    invariants: {
      enabled: true,
      fastChecksEveryBlock: true,
      fullAuditOnStartup: true,
      fullAuditIntervalBlocks: 0,
      stopMiningOnFailure: true
    },
    logging: {
      level: 'debug',
      format: 'json',
      directory: 'logs',
      fileEnabled: false,
      consoleEnabled: false,
      maxFileSizeBytes: 1024 * 1024,
      maxFiles: 3,
      redactSensitiveFields: true,
      logEmptyBlocks: true,
      includeStack: false
    },
    ...overrides
  };
  normalizeLoggingConfig(config);
  return config;
}

function request(port, method, urlPath, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
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

function jsonPost(port, urlPath, payload, headers = {}) {
  const body = JSON.stringify(payload);
  return request(port, 'POST', urlPath, body, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
}

function listen(app) {
  const server = app.listen(0);
  return new Promise((resolve) => server.on('listening', () => resolve({ server, port: server.address().port })));
}

async function withServer(app, fn) {
  const started = await listen(app);
  try {
    await fn(started.port);
  } finally {
    started.server.close();
  }
}

function makeLogger(records, extraConfig = {}, context = {}) {
  const config = baseConfig({ logging: { ...baseConfig().logging, ...extraConfig } });
  return createLogger(config, { mode: 'producer', chainId: config.chain.chainId, ...context }, { records });
}

async function testCoreLogger() {
  const records = [];
  const logger = makeLogger(records);
  logger.info('secret_event', {
    privateKey: 'abc',
    signatureHex: LONG_SECRET,
    nodeId: 'obs_private_node_1',
    nodeIdPrefix: 'obs_private',
    blockHeight: 12
  });
  assert.strictEqual(records.length, 1, 'info event is captured');
  assert.strictEqual(records[0].privateKey, '[REDACTED]', 'private key is redacted');
  assert.strictEqual(records[0].signatureHex, '[REDACTED]', 'signature is redacted');
  assert.strictEqual(records[0].nodeId, '[REDACTED]', 'full node ID is redacted');
  assert.strictEqual(records[0].nodeIdPrefix, 'obs_private', 'safe node ID prefix remains visible');
  assert.strictEqual(records[0].mode, 'producer', 'node mode is included');
  assert.strictEqual(records[0].chainId, 'sparge-test', 'chain ID is included');

  const filtered = [];
  makeLogger(filtered, { level: 'warn' }).debug('hidden_event');
  assert.strictEqual(filtered.length, 0, 'level filtering hides debug below warn');

  const failing = createLogger(baseConfig(), {}, {
    fileSink: { write: () => { throw new Error('disk failed'); } }
  });
  failing.fileSink.write = () => { throw new Error('disk failed'); };
  assert.doesNotThrow(() => failing.error('file_sink_failure_test'), 'logger swallows sink failures');

  const jsonLines = [];
  const originalLog = console.log;
  console.log = (line) => jsonLines.push(line);
  try {
    const config = baseConfig({ logging: { ...baseConfig().logging, format: 'json', consoleEnabled: true } });
    createLogger(config, { mode: 'observer' }).info('json_event', { blockHeight: 1 });
  } finally {
    console.log = originalLog;
  }
  assert.strictEqual(JSON.parse(jsonLines[0]).event, 'json_event', 'json format emits parseable JSON');

  const prettyLines = [];
  console.log = (line) => prettyLines.push(line);
  try {
    const config = baseConfig({ logging: { ...baseConfig().logging, format: 'pretty', consoleEnabled: true } });
    createLogger(config, { mode: 'observer' }).info('pretty_event', { blockHeight: 2 }, 'Pretty message');
  } finally {
    console.log = originalLog;
  }
  assert.ok(prettyLines[0].includes('[pretty_event]'), 'pretty format includes event');
  assert.ok(prettyLines[0].includes('blockHeight=2'), 'pretty format includes fields');
}

async function testApiLogging() {
  const records = [];
  const logger = makeLogger(records);
  const app = express();
  app.use('/api', createRequestIdMiddleware(logger));
  app.use('/api', createHttpRequestLogger(logger));
  app.use('/api/limited', createRateLimiter({
    windowSeconds: 60,
    maxRequests: 1,
    keyFn: () => 'same',
    group: 'logging-test'
  }));
  app.get('/api/ok', (req, res) => res.json({ ok: true, requestId: req.requestId }));
  app.get('/api/fail', () => { throw new Error('boom'); });
  app.post('/api/body', createJsonBodyParser(32), (req, res) => res.json({ ok: true }));
  app.get('/api/limited', (req, res) => res.json({ ok: true }));
  app.use('/api', requestSizeErrorHandler);
  app.use('/api', validationErrorHandler);
  app.use('/api', (err, req, res, next) => {
    if (!err) {
      next();
      return;
    }
    req.log.error('request_failed', {
      operation: 'http_request',
      route: req.path,
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      error: err
    });
    res.status(500).json({ error: 'INTERNAL_ERROR', requestId: req.requestId });
  });

  await withServer(app, async (port) => {
    const ok = await request(port, 'GET', '/api/ok', '', { 'X-Request-ID': 'req-custom-1234' });
    assert.strictEqual(ok.statusCode, 200, 'ok API request succeeds');
    assert.strictEqual(ok.headers['x-request-id'], 'req-custom-1234', 'safe incoming request ID is preserved');

    const generated = await request(port, 'GET', '/api/ok', '', { 'X-Request-ID': '../../bad' });
    assert.match(generated.headers['x-request-id'], /^req_[a-f0-9]{24}$/, 'unsafe request ID is replaced');

    const invalidJson = await request(port, 'POST', '/api/body', '{bad', {
      'Content-Type': 'application/json',
      'Content-Length': 4
    });
    assert.strictEqual(invalidJson.statusCode, 400, 'invalid JSON is rejected');
    assert.ok(invalidJson.body.requestId, 'invalid JSON response includes request ID');

    assert.strictEqual((await request(port, 'GET', '/api/limited')).statusCode, 200, 'first limited request succeeds');
    assert.strictEqual((await request(port, 'GET', '/api/limited')).statusCode, 429, 'second limited request is rate limited');

    const failed = await request(port, 'GET', '/api/fail');
    assert.strictEqual(failed.statusCode, 500, 'unexpected API error becomes 500');
    assert.ok(failed.body.requestId, 'unexpected error response includes request ID');
  });

  assert.ok(records.some((item) => item.event === 'http_request_completed' && item.statusCode === 200), 'HTTP completion is logged');
  assert.ok(records.some((item) => item.event === 'request_body_rejected' && item.errorCode === 'INVALID_JSON'), 'invalid JSON is logged');
  assert.ok(records.some((item) => item.event === 'rate_limit_triggered' && item.statusCode === 429), 'rate limit is logged');
  assert.ok(records.some((item) => item.event === 'request_failed' && item.error?.message === 'boom'), 'unexpected API errors are logged safely');
}

async function testTransactionRejectionLogging() {
  const records = [];
  const logger = makeLogger(records);
  const config = baseConfig();
  const app = express();
  app.use('/api', createRequestIdMiddleware(logger));
  app.use('/api/tx', createJsonBodyParser(16384));
  app.use('/api', rpcRouter({
    getState: () => ({}),
    getGenesis: () => ({}),
    getBalanceUnits: () => '0',
    getNonce: () => '0',
    getParticipantRecord: () => null,
    getSponsorActiveCount: () => 0,
    getTxById: () => null
  }, createMempool(config, logger.child({ component: 'mempool' })), config, logger.child({ component: 'rpc' })));
  app.use('/api', requestSizeErrorHandler);
  app.use('/api', validationErrorHandler);

  await withServer(app, async (port) => {
    const response = await jsonPost(port, '/api/tx', {
      type: 'transfer',
      chainId: 'wrong-chain',
      from: ADDRESS_A,
      to: ADDRESS_B,
      amountMicro: '1',
      feeMicro: '0',
      nonce: '0',
      publicKeyHex: 'a'.repeat(64),
      signatureHex: LONG_SECRET,
      sponsor: '',
      participant: '',
      memo: ''
    });
    assert.strictEqual(response.statusCode, 400, 'invalid chain transaction is rejected');
  });

  const rejected = records.find((item) => item.event === 'transaction_rejected');
  assert.ok(rejected, 'transaction rejection is logged');
  assert.strictEqual(rejected.errorCode, 'INVALID_CHAIN_ID', 'rejection reason is logged');
  assert.strictEqual(rejected.txType, 'transfer', 'transaction type is logged');
  assert.ok(!JSON.stringify(rejected).includes(LONG_SECRET), 'transaction rejection log does not include signature');
}

async function testBlockchainLogging() {
  const config = baseConfig();
  const records = [];
  const logger = createLogger(config, {
    mode: 'producer',
    chainId: config.chain.chainId
  }, { records });
  const dataDir = path.join(__dirname, 'out', 'test-logging-chain');
  fs.rmSync(dataDir, { recursive: true, force: true });
  const storage = new JsonStorage(dataDir, config);
  const mempool = createMempool(config, logger.child({ component: 'mempool' }));
  const chain = createBlockchain(config, mempool, storage, dataDir, logger.child({ component: 'blockchain' }));
  const mined = chain.mineNextBlock();
  assert.ok(mined && mined.height === 1, 'healthy chain mines');
  assert.ok(records.some((item) => item.event === 'block_mined' && item.blockHeight === 1 && item.blockHashPrefix), 'block mining event is logged with aggregate fields');
  storage.close();

  const badRecords = [];
  const badLogger = createLogger(config, {
    mode: 'producer',
    chainId: config.chain.chainId
  }, { records: badRecords });
  const badDir = path.join(__dirname, 'out', 'test-logging-invariant');
  fs.rmSync(badDir, { recursive: true, force: true });
  const badStorage = new JsonStorage(badDir, config);
  const badMempool = createMempool(config, badLogger.child({ component: 'mempool' }));
  badMempool.recomputeAccounting = () => ({ ok: false, errors: ['forced failure'] });
  const badChain = createBlockchain(config, badMempool, badStorage, badDir, badLogger.child({ component: 'blockchain' }));
  assert.strictEqual(badChain.canMint(), false, 'invariant failure still pauses mining');
  assert.ok(badRecords.some((item) => item.event === 'invariant_check_failed' && item.errorCode === 'MEMPOOL_ACCOUNTING_MISMATCH'), 'invariant failure is logged');
  badStorage.close();
}

(async () => {
  await testCoreLogger();
  await testApiLogging();
  await testTransactionRejectionLogging();
  await testBlockchainLogging();
  console.log('logging tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
