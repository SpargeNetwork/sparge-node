const path = require('path');
const express = require('express');
const { loadConfig } = require('./lib/config');
const { createBlockchain } = require('./lib/blockchain');
const { createMiner } = require('./lib/miner');
const { createMempool } = require('./lib/mempool');
const { createStorage } = require('./storage');
const { createObserverSync } = require('./lib/sync');
const { blocksRouter } = require('./routes/blocks');
const { miningRouter } = require('./routes/mining');
const { mempoolRouter } = require('./routes/mempool');
const { rpcRouter } = require('./routes/rpc');
const { debugRouter } = require('./routes/debug');
const { networkRouter } = require('./routes/network');
const { observerSettingsRouter } = require('./routes/observerSettings');
const { createCorsMiddleware, createRateLimiter, createConcurrencyLimiter } = require('./lib/httpSecurity');
const { createObserverHeartbeatClient } = require('./lib/observerHeartbeatClient');
const { validationErrorHandler } = require('./lib/validation/errors');
const {
  getRequestBodyLimits,
  createContentLengthPrecheck,
  createJsonBodyParser,
  requestSizeErrorHandler
} = require('./lib/requestSize');

const app = express();
const config = loadConfig();
app.set('trust proxy', config.security?.trustProxy || false);
if (!config.node) config.node = {};
if (process.env.NODE_MODE) config.node.mode = process.env.NODE_MODE;
if (process.env.PRODUCER_URL) config.node.producerUrl = process.env.PRODUCER_URL;
const nodeMode = config.node?.mode || 'producer';
const mempool = nodeMode === 'producer' ? createMempool(config) : null;
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const storage = createStorage(dataDir, config);
const blockchain = createBlockchain(config, mempool, storage, dataDir);
const miner = nodeMode === 'producer' ? createMiner(blockchain, config) : null;
const observerSync = nodeMode === 'observer' ? createObserverSync(blockchain, config) : null;
const observerHeartbeat = nodeMode === 'observer' ? createObserverHeartbeatClient(blockchain, config, dataDir) : null;

const bodyLimits = getRequestBodyLimits(config);
const rateLimits = config.security?.rateLimits || {};
const rateEnabled = rateLimits.enabled !== false;
const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const skipPostTx = (req) => req.method !== 'POST' || req.path !== '/';
const skipNotPost = (req) => req.method !== 'POST';
app.use('/api', createCorsMiddleware(config));
app.use('/api', createRateLimiter({ enabled: rateEnabled, ...rateLimits.global, keyFn: ipKey, group: 'global' }));
app.use(['/api/status', '/api/genesis', '/api/network/status', '/api/mempool'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.publicRead, keyFn: ipKey, group: 'publicRead' }));
app.use(['/api/block', '/api/blocks'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.blockAndTxLookup, keyFn: ipKey, group: 'blockAndTxLookup' }));
app.use('/api/tx', createRateLimiter({ enabled: rateEnabled, ...rateLimits.blockAndTxLookup, keyFn: ipKey, group: 'blockAndTxLookup', skip: (req) => req.method !== 'GET' }));
app.use(['/api/balance', '/api/nonce', '/api/address'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.addressHistory, keyFn: ipKey, group: 'addressHistory' }));
app.use('/api/network/observers', createRateLimiter({ enabled: rateEnabled, ...rateLimits.addressHistory, keyFn: ipKey, group: 'observerList' }));
app.use('/api/mining', createRateLimiter({ enabled: rateEnabled, ...rateLimits.operator, keyFn: ipKey, group: 'operator' }));
app.use('/api/debug', createRateLimiter({ enabled: rateEnabled, ...rateLimits.operator, keyFn: ipKey, group: 'operator' }));
app.use('/api/tx', createRateLimiter({ enabled: rateEnabled, ...rateLimits.transaction, keyFn: ipKey, group: 'transaction', skip: skipPostTx }));
app.use('/api/tx', createConcurrencyLimiter({ enabled: rateEnabled, maxConcurrentPerIp: rateLimits.transaction?.maxConcurrentPerIp, keyFn: ipKey, group: 'transactionConcurrency', skip: skipPostTx }));
app.use('/api/network/heartbeat', createRateLimiter({ enabled: rateEnabled, ...rateLimits.heartbeat, keyFn: ipKey, group: 'heartbeatIp', skip: skipNotPost }));
app.use('/api/observer/settings', createRateLimiter({ enabled: rateEnabled, ...rateLimits.observerSettings, keyFn: ipKey, group: 'observerSettings', skip: skipNotPost }));
app.use('/api', createContentLengthPrecheck(bodyLimits.json));
app.use('/api/tx', createJsonBodyParser(bodyLimits.transaction));
app.use('/api/network/heartbeat', createJsonBodyParser(bodyLimits.heartbeat));
app.use('/api/observer/settings', createJsonBodyParser(bodyLimits.observerSettings));
app.use('/api/blocks', blocksRouter(blockchain, config));
if (miner) app.use('/api/mining', miningRouter(miner, config));
if (mempool) app.use('/api/mempool', mempoolRouter(mempool));
app.use('/api', rpcRouter(blockchain, mempool, config));
app.use('/api/network', networkRouter(blockchain, storage, mempool, config));
app.use('/api/observer', observerSettingsRouter(config, dataDir));
app.use('/api/debug', debugRouter(blockchain));
app.use('/api', requestSizeErrorHandler);
app.use('/api', validationErrorHandler);
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const isObserverMode = nodeMode === 'observer';
const indexTemplate = isObserverMode ? 'observer-index.html' : 'index.html';
const blockTemplate = isObserverMode ? 'observer-block.html' : 'block.html';
const txTemplate = isObserverMode ? 'observer-tx.html' : 'tx.html';
const addressTemplate = isObserverMode ? 'observer-address.html' : 'address.html';

app.get('/', (req, res) => {
  const indexPath = path.join(publicDir, indexTemplate);
  try {
    const html = require('fs').readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('Missing index.html');
  }
});
app.get(['/wallet', '/wallet/'], (req, res) => {
  if (isObserverMode) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(publicDir, 'wallet.html'));
});
app.get(['/docs', '/docs/'], (req, res) => {
  res.sendFile(path.join(publicDir, 'docs.html'));
});
app.get(['/network', '/network/'], (req, res) => {
  res.sendFile(path.join(publicDir, 'network.html'));
});
app.get(['/block/:height', '/block/:height/'], (req, res) => {
  res.sendFile(path.join(publicDir, blockTemplate));
});
app.get(['/tx/:txid', '/tx/:txid/'], (req, res) => {
  res.sendFile(path.join(publicDir, txTemplate));
});
app.get(['/address/:addr', '/address/:addr/'], (req, res) => {
  res.sendFile(path.join(publicDir, addressTemplate));
});
app.use(express.static(publicDir));

const port = process.env.PORT || 3051;
app.listen(port, () => {
  console.log(`Sparge chain explorer running on http://localhost:${port}`);
});

if (observerSync) {
  observerSync.start();
}

if (observerHeartbeat) {
  observerHeartbeat.start();
}
