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
const { operatorRouter } = require('./routes/operator');
const { createCorsMiddleware, createRateLimiter, createConcurrencyLimiter } = require('./lib/httpSecurity');
const { createObserverHeartbeatClient } = require('./lib/observerHeartbeatClient');
const { validationErrorHandler } = require('./lib/validation/errors');
const { createLogger, createRequestIdMiddleware, createHttpRequestLogger } = require('./lib/logger');
const { createOperatorMetrics } = require('./lib/operatorMetrics');
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
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const operatorMetrics = createOperatorMetrics();
const logger = createLogger(config, {
  mode: nodeMode,
  chainId: config.chain?.chainId,
  softwareVersion: config.chain?.protocolVersion || '1.0.0'
}, { cwd: dataDir, eventSink: operatorMetrics.recordLogEvent });
logger.info('config_loaded', {
  operation: 'config_load',
  loggingFormat: config.logging?.format,
  loggingLevel: config.logging?.level,
  fileLogging: config.logging?.fileEnabled === true
}, 'Config loaded');
const mempool = nodeMode === 'producer' ? createMempool(config, logger.child({ component: 'mempool' })) : null;
const storage = createStorage(dataDir, config);
const blockchain = createBlockchain(config, mempool, storage, dataDir, logger.child({ component: 'blockchain' }));
const miner = nodeMode === 'producer' ? createMiner(blockchain, config, logger.child({ component: 'miner' })) : null;
const observerSync = nodeMode === 'observer' ? createObserverSync(blockchain, config, logger.child({ component: 'observer_sync' })) : null;
const observerHeartbeat = nodeMode === 'observer' ? createObserverHeartbeatClient(blockchain, config, dataDir, logger.child({ component: 'observer_heartbeat' })) : null;

const bodyLimits = getRequestBodyLimits(config);
const rateLimits = config.security?.rateLimits || {};
const rateEnabled = rateLimits.enabled !== false;
const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const skipPostTx = (req) => req.method !== 'POST' || req.path !== '/';
const skipNotPost = (req) => req.method !== 'POST';
app.use('/api', createCorsMiddleware(config));
app.use('/api', operatorMetrics.middleware);
app.use('/api', createRequestIdMiddleware(logger));
app.use('/api', createHttpRequestLogger(logger));
app.use('/api', createRateLimiter({ enabled: rateEnabled, ...rateLimits.global, keyFn: ipKey, group: 'global' }));
app.use(['/api/status', '/api/genesis', '/api/network/status', '/api/mempool'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.publicRead, keyFn: ipKey, group: 'publicRead' }));
app.use(['/api/block', '/api/blocks'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.blockAndTxLookup, keyFn: ipKey, group: 'blockAndTxLookup' }));
app.use('/api/tx', createRateLimiter({ enabled: rateEnabled, ...rateLimits.blockAndTxLookup, keyFn: ipKey, group: 'blockAndTxLookup', skip: (req) => req.method !== 'GET' }));
app.use(['/api/balance', '/api/nonce', '/api/address'], createRateLimiter({ enabled: rateEnabled, ...rateLimits.addressHistory, keyFn: ipKey, group: 'addressHistory' }));
app.use('/api/network/observers', createRateLimiter({ enabled: rateEnabled, ...rateLimits.addressHistory, keyFn: ipKey, group: 'observerList' }));
app.use('/api/mining', createRateLimiter({ enabled: rateEnabled, ...rateLimits.operator, keyFn: ipKey, group: 'operator' }));
app.use('/api/debug', createRateLimiter({ enabled: rateEnabled, ...rateLimits.operator, keyFn: ipKey, group: 'operator' }));
app.use('/api/operator', createRateLimiter({ enabled: rateEnabled, ...rateLimits.operator, keyFn: ipKey, group: 'operatorDashboard' }));
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
app.use('/api', rpcRouter(blockchain, mempool, config, logger.child({ component: 'rpc' })));
app.use('/api/network', networkRouter(blockchain, storage, mempool, config, logger.child({ component: 'network' })));
app.use('/api/observer', observerSettingsRouter(config, dataDir));
app.use('/api/debug', debugRouter(blockchain));
app.use(operatorRouter({ blockchain, storage, mempool, miner, config, dataDir, metrics: operatorMetrics }));
app.use('/api', requestSizeErrorHandler);
app.use('/api', validationErrorHandler);
app.use('/api', (err, req, res, next) => {
  if (!err) {
    next();
    return;
  }
  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const log = req.log || logger;
  log.error('request_failed', {
    operation: 'http_request',
    method: req.method,
    route: req.path || req.originalUrl || req.url,
    statusCode,
    errorCode: err.code || err.errorCode || 'INTERNAL_ERROR',
    error: err
  }, 'API request failed');
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'INTERNAL_ERROR' : (err.code || err.errorCode || 'REQUEST_FAILED'),
    message: statusCode >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    requestId: req.requestId
  });
});
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
logger.info('node_starting', {
  operation: 'startup',
  mode: nodeMode,
  port: Number(port),
  dataDirId: path.basename(dataDir),
  protocolVersion: config.chain?.protocolVersion,
  economicsVersion: config.chain?.economicsVersion,
  invariantsEnabled: config.invariants?.enabled !== false,
  rateLimitsEnabled: rateEnabled,
  requestSizeLimitsEnabled: true,
  mempoolLimits: config.mempool || null
}, 'Node starting');
const server = app.listen(port, () => {
  logger.info('node_started', {
    operation: 'startup',
    mode: nodeMode,
    port: Number(port),
    url: `http://localhost:${port}`
  }, 'Sparge node started');
});

if (observerSync) {
  observerSync.start();
}

if (observerHeartbeat) {
  observerHeartbeat.start();
}

function shutdown(signal) {
  logger.info('node_shutdown', { operation: 'shutdown', signal }, 'Shutdown requested');
  if (observerSync) observerSync.stop();
  if (observerHeartbeat) observerHeartbeat.stop();
  server.close(() => {
    logger.info('node_shutdown_completed', { operation: 'shutdown', signal }, 'Shutdown completed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('node_shutdown_timeout', { operation: 'shutdown', signal }, 'Forcing shutdown after timeout');
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.fatal('uncaught_exception', { operation: 'process', error: err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.error('unhandled_rejection', { operation: 'process', error: err }, 'Unhandled promise rejection');
});
