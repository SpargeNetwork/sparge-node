const assert = require('assert');
const http = require('http');
const express = require('express');
const { operatorRouter } = require('../server/routes/operator');
const { createOperatorMetrics } = require('../server/lib/operatorMetrics');

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ statusCode: res.statusCode, body, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function fakeContext(configOverrides = {}) {
  const config = {
    node: { mode: 'producer' },
    chain: { chainId: 'sparge-test', protocolVersion: '1.0.0', economicsVersion: '1.0.0' },
    network: { observerOfflineAfterSeconds: 180 },
    operatorDashboard: { enabled: false, bindLocalOnly: true },
    ...configOverrides
  };
  const latestBlock = {
    height: 2,
    hash: 'a'.repeat(64),
    timestamp: new Date().toISOString(),
    txCount: 1
  };
  const blockchain = {
    getState: () => ({
      healthy: true,
      chainHealthy: true,
      storageHealthy: true,
      mempoolHealthy: true,
      invariantStatus: 'ok',
      lastInvariantCheckAt: new Date().toISOString(),
      lastInvariantFailureCode: null,
      miningPausedForSafety: false,
      latestHeight: 2,
      latestHash: latestBlock.hash,
      latestBlock,
      blockTimeSeconds: 2,
      totalTransactions: 1,
      mempoolTransactionCount: 0,
      mempoolBytes: 0,
      mempoolMaxBytes: 1000,
      mempoolUtilizationPercent: '0',
      chainId: 'sparge-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0'
    })
  };
  const storage = {
    getAllBlocks: () => [
      { height: 0, hash: '0'.repeat(64), timestamp: new Date(Date.now() - 4000).toISOString(), txCount: 0 },
      { height: 1, hash: '1'.repeat(64), timestamp: new Date(Date.now() - 2000).toISOString(), txCount: 0 },
      latestBlock
    ],
    getAllObserverNodes: () => []
  };
  const mempool = { size: () => 0 };
  const miner = { status: () => ({ active: true, pausedForSafety: false }) };
  const metrics = createOperatorMetrics();
  return { blockchain, storage, mempool, miner, config, dataDir: __dirname, metrics };
}

function startApp(context, trustProxy = false) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(operatorRouter(context));
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.on('listening', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  let started = await startApp(fakeContext());
  try {
    assert.strictEqual((await request(started.port, '/operator')).statusCode, 404, 'dashboard route is unavailable when disabled');
    assert.strictEqual((await request(started.port, '/api/operator/status')).statusCode, 404, 'operator status is unavailable when disabled');
  } finally {
    started.server.close();
  }

  started = await startApp(fakeContext({ operatorDashboard: { enabled: true, bindLocalOnly: true } }));
  try {
    const html = await request(started.port, '/operator');
    assert.strictEqual(html.statusCode, 200, 'dashboard is available from loopback when enabled');
    assert.ok(html.body.includes('Sparge Operator'), 'dashboard HTML is served');
    const js = await request(started.port, '/operator/operator-dashboard.js');
    assert.strictEqual(js.statusCode, 200, 'dashboard JavaScript is served through guarded route');
    const status = await request(started.port, '/api/operator/status');
    assert.strictEqual(status.statusCode, 200, 'operator status is available from loopback when enabled');
    assert.strictEqual(status.json.node.chainId, 'sparge-test', 'operator status includes chain ID');
    assert.ok(!JSON.stringify(status.json).includes('privateKey'), 'operator status does not expose private key fields');
    assert.ok(!JSON.stringify(status.json).includes('signatureHex'), 'operator status does not expose signatures');
  } finally {
    started.server.close();
  }

  started = await startApp(fakeContext({ operatorDashboard: { enabled: true, bindLocalOnly: true } }), 1);
  try {
    const remote = await request(started.port, '/operator', { 'X-Forwarded-For': '203.0.113.10' });
    assert.strictEqual(remote.statusCode, 403, 'non-local dashboard access is rejected when local-only is enabled');
  } finally {
    started.server.close();
  }

  console.log('operator dashboard tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
