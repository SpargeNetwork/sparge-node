const path = require('path');
const express = require('express');
const {
  deriveAddress,
  verifySignature,
  createTxId,
  buildMessage
} = require('../lib/tx');
const { PARTICIPANT_BOND_MICRO, MAX_SPONSORED_PARTICIPANTS } = require('../lib/participants');
const { validateBody, validateParams, validateQuery } = require('../lib/validation/middleware');
const {
  addressParams,
  heightParams,
  txidParams,
  addressTxsQuery,
  signedTxBody
} = require('../lib/validation/schemas');

const publicIndex = path.join(__dirname, '..', '..', 'public', 'index.html');

function rpcRouter(blockchain, mempool, config, logger = null) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json(blockchain.getState());
  });

  router.get('/genesis', (req, res) => {
    res.json(blockchain.getGenesis());
  });

  router.get('/balance/:addr', validateParams(addressParams), (req, res) => {
    const balance = blockchain.getBalanceUnits(req.params.addr);
    res.json({ address: req.params.addr, balanceMicro: balance });
  });

  router.get('/nonce/:addr', validateParams(addressParams), (req, res) => {
    const nonce = blockchain.getNonce(req.params.addr);
    res.json({ address: req.params.addr, nonce });
  });

  router.get('/block/:height', validateParams(heightParams), (req, res) => {
    const height = req.params.height;
    const block = blockchain.getBlockByHeight(height);
    if (!block) {
      res.status(404).json({ error: 'block not found' });
      return;
    }
    res.json(block);
  });

  router.get('/tx/:txid', validateParams(txidParams), (req, res) => {
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

  router.get('/address/:addr', validateParams(addressParams), (req, res) => {
    const stats = blockchain.getAddressStats(req.params.addr);
    res.json(stats);
  });

  router.get('/address/:addr/txs', validateParams(addressParams), validateQuery(addressTxsQuery), (req, res) => {
    const limit = req.query.limit;
    const txs = blockchain.getAddressTxs(req.params.addr, limit);
    res.json({ address: req.params.addr, txs });
  });

  router.post('/tx', validateBody(signedTxBody), (req, res) => {
    const startedAt = Date.now();
    const routeLog = req.log || logger;
    const logRejected = (statusCode, reasonCode, tx = req.body || {}) => {
      if (routeLog) routeLog.warn('transaction_rejected', {
        operation: 'transaction_admission',
        statusCode,
        errorCode: reasonCode,
        txType: tx.type || '',
        txidPrefix: tx.txid ? String(tx.txid).slice(0, 12) : '',
        durationMs: Date.now() - startedAt
      }, 'Transaction rejected');
    };
    if (config.node?.mode === 'observer') {
      logRejected(403, 'OBSERVER_READ_ONLY');
      res.status(403).json({ error: 'observer node is read-only' });
      return;
    }
    if (!mempool) {
      logRejected(503, 'MEMPOOL_UNAVAILABLE');
      res.status(503).json({ error: 'mempool unavailable' });
      return;
    }

    const tx = req.body;

    if (tx.chainId !== config.chain.chainId) {
      logRejected(400, 'INVALID_CHAIN_ID', tx);
      res.status(400).json({ error: 'invalid chainId' });
      return;
    }

    let derived = '';
    try {
      derived = deriveAddress(tx.publicKeyHex);
    } catch (err) {
      logRejected(400, 'INVALID_PUBLIC_KEY', tx);
      res.status(400).json({ error: err.message });
      return;
    }
    const signerAddress = derived;
    if (tx.from !== signerAddress) {
      logRejected(400, 'FROM_PUBLIC_KEY_MISMATCH', tx);
      res.status(400).json({ error: 'from does not match publicKeyHex' });
      return;
    }

    let signatureOk = false;
    try {
      signatureOk = verifySignature(tx);
    } catch (err) {
      logRejected(400, 'INVALID_SIGNATURE', tx);
      res.status(400).json({ error: 'invalid signature' });
      return;
    }
    if (!signatureOk) {
      logRejected(400, 'INVALID_SIGNATURE', tx);
      res.status(400).json({ error: 'invalid signature' });
      return;
    }

    const amount = BigInt(tx.amountMicro || '0');
    const fee = BigInt(tx.feeMicro || '0');

    if (tx.type === 'transfer') {
      if (!tx.from || !tx.to) {
        logRejected(400, 'FROM_TO_REQUIRED', tx);
        res.status(400).json({ error: 'from/to required' });
        return;
      }
      if (amount <= 0n) {
        logRejected(400, 'INVALID_AMOUNT', tx);
        res.status(400).json({ error: 'amountMicro must be > 0' });
        return;
      }
      if (tx.sponsor) {
        logRejected(400, 'INVALID_SPONSOR_FIELD', tx);
        res.status(400).json({ error: 'sponsor must be empty for transfer' });
        return;
      }
      if (tx.participant) {
        logRejected(400, 'INVALID_PARTICIPANT_FIELD', tx);
        res.status(400).json({ error: 'participant must be empty for transfer' });
        return;
      }
    } else {
      if (tx.to) {
        logRejected(400, 'INVALID_TO_FIELD', tx);
        res.status(400).json({ error: 'to must be empty for this tx type' });
        return;
      }
      if (amount !== 0n) {
        logRejected(400, 'INVALID_AMOUNT', tx);
        res.status(400).json({ error: 'amountMicro must be 0 for this tx type' });
        return;
      }
    }

    let feePayer = signerAddress;
    let bondMicro = 0n;
    let isGenesisFree = false;
    if (tx.type === 'register_participant') {
      if (!tx.participant) {
        logRejected(400, 'PARTICIPANT_REQUIRED', tx);
        res.status(400).json({ error: 'participant required' });
        return;
      }
      if (tx.sponsor && tx.sponsor !== tx.from) {
        logRejected(400, 'SPONSOR_MISMATCH', tx);
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
        logRejected(400, 'PARTICIPANT_ALREADY_REGISTERED', tx);
        res.status(400).json({ error: 'participant already registered' });
        return;
      }
      const activeSponsored = blockchain.getSponsorActiveCount(tx.from);
      if (activeSponsored >= MAX_SPONSORED_PARTICIPANTS) {
        logRejected(400, 'SPONSOR_LIMIT_REACHED', tx);
        res.status(400).json({ error: 'sponsor limit reached' });
        return;
      }
      bondMicro = isGenesisFree ? 0n : PARTICIPANT_BOND_MICRO;
    } else if (tx.type === 'unregister_participant' || tx.type === 'heartbeat') {
      if (tx.sponsor) {
        logRejected(400, 'INVALID_SPONSOR_FIELD', tx);
        res.status(400).json({ error: 'sponsor must be empty for this tx type' });
        return;
      }
      if (tx.participant) {
        logRejected(400, 'INVALID_PARTICIPANT_FIELD', tx);
        res.status(400).json({ error: 'participant must be empty for this tx type' });
        return;
      }
      const existing = blockchain.getParticipantRecord(tx.from);
      if (!existing) {
        logRejected(400, 'PARTICIPANT_NOT_REGISTERED', tx);
        res.status(400).json({ error: 'participant not registered' });
        return;
      }
    }

    const minFee = BigInt(config.tx?.minFeeMicro ?? config.gas?.baseFeeInitialMicro ?? '0');
    if (!isGenesisFree && fee < minFee) {
      logRejected(400, 'FEE_TOO_LOW', tx);
      res.status(400).json({ error: `feeMicro must be >= ${minFee.toString()}` });
      return;
    }

    const balance = BigInt(blockchain.getBalanceUnits(feePayer));
    const ledgerNonce = BigInt(blockchain.getNonce(feePayer));
    const pendingSpend = mempool.getPendingSpend(feePayer, ledgerNonce);
    const totalSpend = amount + fee + bondMicro + pendingSpend;
    if (balance < totalSpend) {
      logRejected(400, 'INSUFFICIENT_BALANCE', tx);
      res.status(400).json({ error: 'insufficient balance' });
      return;
    }

    const maxNonce = mempool.getMaxNonce(feePayer);
    const expectedNonce = maxNonce === null ? ledgerNonce : maxNonce + 1n;
    const maxFutureNonceGap = BigInt(config.mempool?.maxFutureNonceGap || 100);
    if (BigInt(tx.nonce || '0') > ledgerNonce + maxFutureNonceGap) {
      logRejected(400, 'NONCE_TOO_FAR_AHEAD', tx);
      res.status(400).json({
        error: 'NONCE_TOO_FAR_AHEAD',
        message: 'Transaction nonce is too far ahead of the confirmed account nonce.'
      });
      return;
    }
    if (BigInt(tx.nonce || '0') !== expectedNonce) {
      logRejected(400, 'INVALID_NONCE', tx);
      res.status(400).json({ error: `invalid nonce (expected ${expectedNonce.toString()})` });
      return;
    }

    const message = buildMessage(tx);
    const txid = createTxId(tx);
    if (typeof mempool.hasTx === 'function' && mempool.hasTx(txid)) {
      logRejected(409, 'MEMPOOL_DUPLICATE_PENDING', tx);
      res.status(409).json({ error: 'MEMPOOL_DUPLICATE', message: 'Transaction is already pending.' });
      return;
    }
    if (blockchain.getTxById(txid)) {
      logRejected(409, 'MEMPOOL_DUPLICATE_CONFIRMED', tx);
      res.status(409).json({ error: 'MEMPOOL_DUPLICATE', message: 'Transaction is already confirmed.' });
      return;
    }

    try {
      mempool.addTx({
        ...tx,
        signer: feePayer,
        bondMicro: bondMicro.toString(),
        id: txid,
        txid,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      if (err && err.code === 'MEMPOOL_FULL') {
        logRejected(503, 'MEMPOOL_FULL', tx);
        res.status(503).json({ error: 'MEMPOOL_FULL', message: 'The transaction pool is currently full. Please try again later.' });
        return;
      }
      if (err && err.code === 'MEMPOOL_SENDER_LIMIT') {
        logRejected(429, 'MEMPOOL_SENDER_LIMIT', tx);
        res.status(429).json({ error: 'MEMPOOL_SENDER_LIMIT', message: 'This account has too many pending transactions.' });
        return;
      }
      if (err && err.code === 'MEMPOOL_DUPLICATE') {
        logRejected(409, 'MEMPOOL_DUPLICATE', tx);
        res.status(409).json({ error: 'MEMPOOL_DUPLICATE', message: 'Transaction is already pending.' });
        return;
      }
      throw err;
    }

    if (routeLog) routeLog.info('transaction_accepted', {
      operation: 'transaction_admission',
      txType: tx.type || '',
      txidPrefix: txid.slice(0, 12),
      durationMs: Date.now() - startedAt
    }, 'Transaction accepted');
    res.json({ status: 'queued', txid, message });
  });

  return router;
}

module.exports = { rpcRouter };
