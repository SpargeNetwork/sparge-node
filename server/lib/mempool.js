const DEFAULT_MEMPOOL_LIMITS = {
  sort: 'fee',
  maxTransactions: 10000,
  maxBytes: 50 * 1024 * 1024,
  maxTransactionsPerSender: 100,
  transactionTtlSeconds: 3600,
  maxFutureNonceGap: 100,
  minimumFeeMicro: '0'
};

const MAX_SAFE_MEMPOOL_TRANSACTIONS = 1000000;
const MAX_SAFE_MEMPOOL_BYTES = 1024 * 1024 * 1024;

class MempoolError extends Error {
  constructor(code, message, statusCode = 503) {
    super(message);
    this.name = 'MempoolError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parsePositiveInteger(value, field, max) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max) return parsed;
  }
  throw new Error(`${field} must be a positive safe integer <= ${max}`);
}

function parseNonNegativeBigIntString(value, field) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value.trim())) return value.trim();
  throw new Error(`${field} must be a non-negative integer string`);
}

function normalizeMempoolConfig(config) {
  if (!config.mempool) config.mempool = {};
  const src = config.mempool;
  src.sort = (src.sort || DEFAULT_MEMPOOL_LIMITS.sort).toString().toLowerCase();
  if (!['fee', 'fifo'].includes(src.sort)) throw new Error('mempool.sort must be fee or fifo');
  src.maxTransactions = parsePositiveInteger(src.maxTransactions ?? DEFAULT_MEMPOOL_LIMITS.maxTransactions, 'mempool.maxTransactions', MAX_SAFE_MEMPOOL_TRANSACTIONS);
  src.maxBytes = parsePositiveInteger(src.maxBytes ?? DEFAULT_MEMPOOL_LIMITS.maxBytes, 'mempool.maxBytes', MAX_SAFE_MEMPOOL_BYTES);
  src.maxTransactionsPerSender = parsePositiveInteger(src.maxTransactionsPerSender ?? DEFAULT_MEMPOOL_LIMITS.maxTransactionsPerSender, 'mempool.maxTransactionsPerSender', MAX_SAFE_MEMPOOL_TRANSACTIONS);
  src.transactionTtlSeconds = parsePositiveInteger(src.transactionTtlSeconds ?? DEFAULT_MEMPOOL_LIMITS.transactionTtlSeconds, 'mempool.transactionTtlSeconds', 86400 * 30);
  src.maxFutureNonceGap = parsePositiveInteger(src.maxFutureNonceGap ?? DEFAULT_MEMPOOL_LIMITS.maxFutureNonceGap, 'mempool.maxFutureNonceGap', MAX_SAFE_MEMPOOL_TRANSACTIONS);
  src.minimumFeeMicro = parseNonNegativeBigIntString(src.minimumFeeMicro ?? src.minimumFee ?? DEFAULT_MEMPOOL_LIMITS.minimumFeeMicro, 'mempool.minimumFeeMicro');
  return src;
}

function stableTxForSizing(tx) {
  return {
    id: tx.id || '',
    txid: tx.txid || tx.id || '',
    type: tx.type || 'transfer',
    from: tx.from || null,
    to: tx.to || null,
    sponsor: tx.sponsor || '',
    participant: tx.participant || '',
    signer: tx.signer || tx.from || null,
    amountMicro: tx.amountMicro || '0',
    feeMicro: tx.feeMicro || '0',
    bondMicro: tx.bondMicro || '0',
    nonce: tx.nonce || '0',
    chainId: tx.chainId || '',
    publicKeyHex: tx.publicKeyHex || '',
    signatureHex: tx.signatureHex || '',
    memo: tx.memo || '',
    timestamp: tx.timestamp || ''
  };
}

function estimateTxBytes(tx) {
  return Buffer.byteLength(JSON.stringify(stableTxForSizing(tx)), 'utf8');
}

function createMempool(config) {
  const cfg = normalizeMempoolConfig(config);
  const sortMode = cfg.sort;
  const txById = new Map();
  const insertionOrder = [];
  const senderCounts = new Map();
  let totalBytes = 0;
  let unhealthyReason = null;
  const stats = {
    expiredTransactionsRemoved: 0,
    rejectedMempoolFull: 0,
    rejectedSenderLimit: 0,
    rejectedDuplicate: 0,
    rejectedOversizedTransaction: 0
  };
  let lastLogAt = 0;

  function logMempoolEvent(event, fields = {}) {
    const now = Date.now();
    if (now - lastLogAt < 30000) return;
    lastLogAt = now;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields
    }));
  }

  function normalizeTx(tx, now) {
    return {
      id: tx.id,
      txid: tx.txid || tx.id,
      type: tx.type || 'transfer',
      from: tx.from || null,
      to: tx.to || null,
      sponsor: tx.sponsor || '',
      participant: tx.participant || '',
      signer: tx.signer || tx.from || null,
      amountMicro: tx.amountMicro || '0',
      feeMicro: tx.feeMicro || '0',
      bondMicro: tx.bondMicro || '0',
      nonce: tx.nonce || '0',
      chainId: tx.chainId || '',
      publicKeyHex: tx.publicKeyHex || '',
      signatureHex: tx.signatureHex || '',
      memo: tx.memo || '',
      timestamp: tx.timestamp || new Date(now).toISOString(),
      admittedAt: now
    };
  }

  function removeInternal(id, reason = 'removed') {
    const tx = txById.get(id);
    if (!tx) return false;
    txById.delete(id);
    totalBytes -= Number(tx.mempoolBytes || 0);
    if (totalBytes < 0) totalBytes = 0;
    const signer = tx.signer || tx.from || '';
    if (signer) {
      const current = senderCounts.get(signer) || 0;
      if (current <= 1) senderCounts.delete(signer);
      else senderCounts.set(signer, current - 1);
    }
    const index = insertionOrder.indexOf(id);
    if (index >= 0) insertionOrder.splice(index, 1);
    if (reason === 'expired') stats.expiredTransactionsRemoved += 1;
    return true;
  }

  function cleanupExpired(now = Date.now(), maxRemovals = 1000) {
    const ttlMs = cfg.transactionTtlSeconds * 1000;
    let removed = 0;
    for (const id of insertionOrder.slice()) {
      if (removed >= maxRemovals) break;
      const tx = txById.get(id);
      if (!tx) {
        const index = insertionOrder.indexOf(id);
        if (index >= 0) insertionOrder.splice(index, 1);
        continue;
      }
      if (now - Number(tx.admittedAt || 0) > ttlMs) {
        removeInternal(id, 'expired');
        removed += 1;
      }
    }
    if (removed > 0) logMempoolEvent('mempool_expired_cleanup', { removed });
    return removed;
  }

  function assertHealthy() {
    const check = recomputeAccounting();
    if (!check.ok) {
      unhealthyReason = check.errors.join('; ');
      logMempoolEvent('mempool_accounting_invariant_failed', { errors: check.errors.length });
      return false;
    }
    unhealthyReason = null;
    return true;
  }

  function addTx(tx, options = {}) {
    const now = Number(options.now || Date.now());
    cleanupExpired(now);
    const id = tx.txid || tx.id;
    if (!id) throw new MempoolError('MEMPOOL_INVALID_TRANSACTION', 'Transaction id is required.', 400);
    if (txById.has(id)) {
      stats.rejectedDuplicate += 1;
      throw new MempoolError('MEMPOOL_DUPLICATE', 'Transaction is already pending.', 409);
    }
    const normalized = normalizeTx({ ...tx, id, txid: id }, now);
    const signer = normalized.signer || normalized.from || '';
    if (!signer) throw new MempoolError('MEMPOOL_INVALID_TRANSACTION', 'Transaction signer is required.', 400);
    const txBytes = estimateTxBytes(normalized);
    if (txBytes > cfg.maxBytes) {
      stats.rejectedOversizedTransaction += 1;
      logMempoolEvent('mempool_oversized_transaction_rejected', { txBytes });
      throw new MempoolError('MEMPOOL_FULL', 'The transaction pool is currently full. Please try again later.', 503);
    }
    if ((senderCounts.get(signer) || 0) >= cfg.maxTransactionsPerSender) {
      stats.rejectedSenderLimit += 1;
      logMempoolEvent('mempool_sender_limit_rejected');
      throw new MempoolError('MEMPOOL_SENDER_LIMIT', 'This account has too many pending transactions.', 429);
    }
    if (txById.size + 1 > cfg.maxTransactions || totalBytes + txBytes > cfg.maxBytes) {
      stats.rejectedMempoolFull += 1;
      logMempoolEvent('mempool_full_rejected', { count: txById.size, bytes: totalBytes });
      throw new MempoolError('MEMPOOL_FULL', 'The transaction pool is currently full. Please try again later.', 503);
    }
    normalized.mempoolBytes = txBytes;
    txById.set(id, normalized);
    insertionOrder.push(id);
    senderCounts.set(signer, (senderCounts.get(signer) || 0) + 1);
    totalBytes += txBytes;
    assertHealthy();
    return { txid: id, bytes: txBytes };
  }

  function publicTx(tx) {
    const { mempoolBytes, admittedAt, ...rest } = tx;
    return rest;
  }

  function list(options = {}) {
    cleanupExpired(options.now || Date.now());
    return insertionOrder
      .map((id) => txById.get(id))
      .filter(Boolean)
      .map(publicTx);
  }

  function getMaxNonce(address) {
    cleanupExpired();
    let max = null;
    for (const tx of txById.values()) {
      if (tx.signer !== address) continue;
      const nonce = BigInt(tx.nonce || '0');
      if (max === null || nonce > max) max = nonce;
    }
    return max;
  }

  function getPendingSpend(address, startNonce) {
    cleanupExpired();
    if (startNonce === undefined || startNonce === null) {
      let total = 0n;
      for (const tx of txById.values()) {
        if (tx.signer !== address) continue;
        total += BigInt(tx.amountMicro || '0') + BigInt(tx.feeMicro || '0') + BigInt(tx.bondMicro || '0');
      }
      return total;
    }

    const byNonce = new Map();
    for (const tx of txById.values()) {
      if (tx.signer !== address) continue;
      const nonce = BigInt(tx.nonce || '0');
      const fee = BigInt(tx.feeMicro || '0');
      const id = tx.txid || tx.id;
      const existing = byNonce.get(nonce);
      if (!existing) {
        byNonce.set(nonce, tx);
        continue;
      }
      const existingFee = BigInt(existing.feeMicro || '0');
      const existingId = existing.txid || existing.id;
      if (fee > existingFee || (fee === existingFee && id < existingId)) {
        byNonce.set(nonce, tx);
      }
    }

    let total = 0n;
    let cursor = BigInt(startNonce);
    while (byNonce.has(cursor)) {
      const tx = byNonce.get(cursor);
      total += BigInt(tx.amountMicro || '0') + BigInt(tx.feeMicro || '0') + BigInt(tx.bondMicro || '0');
      cursor += 1n;
    }
    return total;
  }

  function removeByIds(ids) {
    let removed = 0;
    for (const id of ids || []) {
      if (removeInternal(id, 'removed')) removed += 1;
    }
    assertHealthy();
    return removed;
  }

  function hasTx(id) {
    cleanupExpired();
    return txById.has(id);
  }

  function size() {
    cleanupExpired();
    return txById.size;
  }

  function getStats() {
    cleanupExpired();
    return {
      mempoolTransactionCount: txById.size,
      mempoolBytes: totalBytes,
      mempoolMaxTransactions: cfg.maxTransactions,
      mempoolMaxBytes: cfg.maxBytes,
      mempoolUtilizationPercent: Number((Math.max(
        txById.size / cfg.maxTransactions,
        totalBytes / cfg.maxBytes
      ) * 100).toFixed(2)),
      expiredTransactionsRemoved: stats.expiredTransactionsRemoved,
      rejectedMempoolFull: stats.rejectedMempoolFull,
      rejectedSenderLimit: stats.rejectedSenderLimit,
      rejectedDuplicate: stats.rejectedDuplicate,
      rejectedOversizedTransaction: stats.rejectedOversizedTransaction,
      unhealthy: Boolean(unhealthyReason),
      unhealthyReason
    };
  }

  function recomputeAccounting() {
    const errors = [];
    let computedBytes = 0;
    const computedSenderCounts = new Map();
    for (const [id, tx] of txById.entries()) {
      if (!insertionOrder.includes(id)) errors.push(`tx ${id} missing from insertion order`);
      computedBytes += Number(tx.mempoolBytes || 0);
      const signer = tx.signer || tx.from || '';
      if (!signer) errors.push(`tx ${id} missing signer`);
      else computedSenderCounts.set(signer, (computedSenderCounts.get(signer) || 0) + 1);
    }
    for (const id of insertionOrder) {
      if (!txById.has(id)) errors.push(`insertion order references missing tx ${id}`);
    }
    if (computedBytes !== totalBytes) errors.push(`byte mismatch tracked=${totalBytes} computed=${computedBytes}`);
    if (txById.size !== insertionOrder.length) errors.push(`count mismatch map=${txById.size} order=${insertionOrder.length}`);
    for (const [sender, count] of senderCounts.entries()) {
      if ((computedSenderCounts.get(sender) || 0) !== count) errors.push(`sender count mismatch for ${sender}`);
    }
    for (const [sender, count] of computedSenderCounts.entries()) {
      if ((senderCounts.get(sender) || 0) !== count) errors.push(`sender count missing for ${sender}`);
    }
    if (totalBytes < 0) errors.push('negative total bytes');
    return {
      ok: errors.length === 0,
      errors,
      totalBytes,
      count: txById.size,
      senderCountEntries: senderCounts.size
    };
  }

  return {
    addTx,
    list,
    getMaxNonce,
    getPendingSpend,
    removeByIds,
    hasTx,
    size,
    getStats,
    cleanupExpired,
    recomputeAccounting,
    estimateTxBytes,
    sortMode
  };
}

module.exports = {
  createMempool,
  normalizeMempoolConfig,
  estimateTxBytes,
  MempoolError,
  DEFAULT_MEMPOOL_LIMITS
};
