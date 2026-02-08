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
const { createCorsMiddleware, createRateLimiter } = require('./lib/httpSecurity');

const app = express();
const config = loadConfig();
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

const jsonBodyLimit = config?.http?.jsonBodyLimit || '64kb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use('/api', createCorsMiddleware(config));
app.use('/api', createRateLimiter(config?.http?.rateLimit));
app.use('/api/tx', createRateLimiter(config?.http?.txRateLimit));
app.use('/api/blocks', blocksRouter(blockchain, config));
if (miner) app.use('/api/mining', miningRouter(miner, config));
if (mempool) app.use('/api/mempool', mempoolRouter(mempool));
app.use('/api', rpcRouter(blockchain, mempool, config));
app.use('/api/debug', debugRouter(blockchain));
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
