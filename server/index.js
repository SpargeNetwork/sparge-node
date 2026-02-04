const path = require('path');
const express = require('express');
const { loadConfig } = require('./lib/config');
const { createBlockchain } = require('./lib/blockchain');
const { createMiner } = require('./lib/miner');
const { createMempool } = require('./lib/mempool');
const { blocksRouter } = require('./routes/blocks');
const { miningRouter } = require('./routes/mining');
const { mempoolRouter } = require('./routes/mempool');
const { rpcRouter } = require('./routes/rpc');
const { debugRouter } = require('./routes/debug');

const app = express();
const config = loadConfig();
const mempool = createMempool(config);
const blockchain = createBlockchain(config, mempool);
const miner = createMiner(blockchain, config);

app.use(express.json());
app.use('/api/blocks', blocksRouter(blockchain));
app.use('/api/mining', miningRouter(miner));
app.use('/api/mempool', mempoolRouter(mempool));
app.use('/api', rpcRouter(blockchain, mempool, config));
app.use('/api/debug', debugRouter(blockchain));
app.get(['/wallet', '/wallet/'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'wallet.html'));
});
app.get(['/docs', '/docs/'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'docs.html'));
});
app.get(['/block/:height', '/block/:height/'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'block.html'));
});
app.get(['/tx/:txid', '/tx/:txid/'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tx.html'));
});
app.get(['/address/:addr', '/address/:addr/'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'address.html'));
});
app.use(express.static(path.join(__dirname, '..', 'public')));

const port = process.env.PORT || 3051;
app.listen(port, () => {
  console.log(`Sparge chain explorer running on http://localhost:${port}`);
});
