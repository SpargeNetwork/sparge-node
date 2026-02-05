const path = require('path');
const express = require('express');
const {
  normalizeTxInput,
  deriveAddress,
  verifySignature,
  createTxId,
  buildMessage,
  isHex
} = require('../lib/tx');
const { PARTICIPANT_BOND_MICRO, MAX_SPONSORED_PARTICIPANTS } = require('../lib/participants');

const publicIndex = path.join(__dirname, '..', '..', 'public', 'index.html');

function rpcRouter(blockchain, mempool, config) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json(blockchain.getState());
  });

  router.get('/genesis', (req, res) => {
    res.json(blockchain.getGenesis());
  });

  router.get('/balance/:addr', (req, res) => {
    const balance = blockchain.getBalanceUnits(req.params.addr);
    res.json({ address: req.params.addr, balanceMicro: balance });
  });

  router.get('/nonce/:addr', (req, res) => {
    const nonce = blockchain.getNonce(req.params.addr);
    res.json({ address: req.params.addr, nonce });
  });

  router.get('/block/:height', (req, res) => {
    const height = Number(req.params.height);
    const block = blockchain.getBlockByHeight(height);
    if (!block) {
      res.status(404).json({ error: 'block not found' });
      return;
    }
    res.json(block);
  });

  router.get('/tx/:txid', (req, res) => {
    if (req.baseUrl !== '/api' && req.accepts('html')) {
      res.sendFile(publicIndex);
      return;
    }

    const tx = blockchain.getTxById(req.params.txid);
    if (!tx) {
      res.status(404).json({ error: 'tx not found' });
      return;
    }
    res.json(tx);
  });

  router.get('/address/:addr', (req, res) => {
    const stats = blockchain.getAddressStats(req.params.addr);
    res.json(stats);
  });

  router.get('/address/:addr/txs', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const txs = blockchain.getAddressTxs(req.params.addr, limit);
    res.json({ address: req.params.addr, txs });
  });

  router.post('/tx', (req, res) => {
    if (!mempool) {
      res.status(503).json({ error: 'mempool unavailable' });
      return;
    }

    let tx;
    try {
      tx = normalizeTxInput(req.body || {});
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    tx.type = (tx.type || '').toLowerCase();
    tx.from = tx.from || '';
    tx.to = tx.to || '';
    tx.publicKeyHex = (tx.publicKeyHex || '').toLowerCase();
    tx.signatureHex = (tx.signatureHex || '').toLowerCase();
    tx.sponsor = tx.sponsor || '';
    tx.participant = tx.participant || '';
    if (typeof tx.memo === 'string') tx.memo = tx.memo;

    if (!tx.type || !tx.publicKeyHex || !tx.signatureHex || !tx.chainId) {
      res.status(400).json({ error: 'missing required fields' });
      return;
    }

    if (!isHex(tx.publicKeyHex, 64)) {
      res.status(400).json({ error: 'publicKeyHex must be 64 hex chars' });
      return;
    }
    if (!isHex(tx.signatureHex)) {
      res.status(400).json({ error: 'signatureHex must be hex' });
      return;
    }

    if (tx.memo && tx.memo.length > 128) {
      res.status(400).json({ error: 'memo must be <= 128 chars' });
      return;
    }

    const validTypes = new Set(['transfer', 'register_participant', 'unregister_participant', 'heartbeat']);
    if (!validTypes.has(tx.type)) {
      res.status(400).json({ error: 'invalid tx type' });
      return;
    }

    if (tx.chainId !== config.chain.chainId) {
      res.status(400).json({ error: 'invalid chainId' });
      return;
    }

    let derived = '';
    try {
      derived = deriveAddress(tx.publicKeyHex);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const signerAddress = derived;
    if (tx.from !== signerAddress) {
      res.status(400).json({ error: 'from does not match publicKeyHex' });
      return;
    }

    let signatureOk = false;
    try {
      signatureOk = verifySignature(tx);
    } catch (err) {
      res.status(400).json({ error: 'invalid signature' });
      return;
    }
    if (!signatureOk) {
      res.status(400).json({ error: 'invalid signature' });
      return;
    }

    const amount = BigInt(tx.amountMicro || '0');
    const fee = BigInt(tx.feeMicro || '0');

    if (tx.type === 'transfer') {
      if (!tx.from || !tx.to) {
        res.status(400).json({ error: 'from/to required' });
        return;
      }
      if (amount <= 0n) {
        res.status(400).json({ error: 'amountMicro must be > 0' });
        return;
      }
      if (tx.sponsor) {
        res.status(400).json({ error: 'sponsor must be empty for transfer' });
        return;
      }
      if (tx.participant) {
        res.status(400).json({ error: 'participant must be empty for transfer' });
        return;
      }
    } else {
      if (tx.to) {
        res.status(400).json({ error: 'to must be empty for this tx type' });
        return;
      }
      if (amount !== 0n) {
        res.status(400).json({ error: 'amountMicro must be 0 for this tx type' });
        return;
      }
    }

    let feePayer = signerAddress;
    let bondMicro = 0n;
    let isGenesisFree = false;
    if (tx.type === 'register_participant') {
      if (!tx.participant) {
        res.status(400).json({ error: 'participant required' });
        return;
      }
      if (tx.sponsor && tx.sponsor !== tx.from) {
        res.status(400).json({ error: 'sponsor must match from' });
        return;
      }
      const genesisCtx = blockchain.getGenesisFreeContext ? blockchain.getGenesisFreeContext() : null;
      if (genesisCtx && genesisCtx.genesisOperatorAddress) {
        const withinFreeWindow = genesisCtx.latestHeight < Number(genesisCtx.genesisFreeBlocks || 0);
        isGenesisFree = !genesisCtx.genesisFreeUsed
          && withinFreeWindow
          && tx.from === genesisCtx.genesisOperatorAddress
          && tx.participant === tx.from;
      }
      const existing = blockchain.getParticipantRecord(tx.participant);
      if (existing) {
        res.status(400).json({ error: 'participant already registered' });
        return;
      }
      const activeSponsored = blockchain.getSponsorActiveCount(tx.from);
      if (activeSponsored >= MAX_SPONSORED_PARTICIPANTS) {
        res.status(400).json({ error: 'sponsor limit reached' });
        return;
      }
      bondMicro = isGenesisFree ? 0n : PARTICIPANT_BOND_MICRO;
    } else if (tx.type === 'unregister_participant' || tx.type === 'heartbeat') {
      if (tx.sponsor) {
        res.status(400).json({ error: 'sponsor must be empty for this tx type' });
        return;
      }
      if (tx.participant) {
        res.status(400).json({ error: 'participant must be empty for this tx type' });
        return;
      }
      const existing = blockchain.getParticipantRecord(tx.from);
      if (!existing) {
        res.status(400).json({ error: 'participant not registered' });
        return;
      }
    }

    const minFee = BigInt(config.tx?.minFeeMicro ?? config.gas?.baseFeeInitialMicro ?? '0');
    if (!isGenesisFree && fee < minFee) {
      res.status(400).json({ error: `feeMicro must be >= ${minFee.toString()}` });
      return;
    }

    const balance = BigInt(blockchain.getBalanceUnits(feePayer));
    const ledgerNonce = BigInt(blockchain.getNonce(feePayer));
    const pendingSpend = mempool.getPendingSpend(feePayer, ledgerNonce);
    const totalSpend = amount + fee + bondMicro + pendingSpend;
    if (balance < totalSpend) {
      res.status(400).json({ error: 'insufficient balance' });
      return;
    }

    const maxNonce = mempool.getMaxNonce(feePayer);
    const expectedNonce = maxNonce === null ? ledgerNonce : maxNonce + 1n;
    if (BigInt(tx.nonce || '0') !== expectedNonce) {
      res.status(400).json({ error: `invalid nonce (expected ${expectedNonce.toString()})` });
      return;
    }

    const message = buildMessage(tx);
    const txid = createTxId(tx);
    mempool.addTx({
      ...tx,
      signer: feePayer,
      bondMicro: bondMicro.toString(),
      id: txid,
      txid,
      timestamp: new Date().toISOString()
    });

    res.json({ status: 'queued', txid, message });
  });

  return router;
}

module.exports = { rpcRouter };
