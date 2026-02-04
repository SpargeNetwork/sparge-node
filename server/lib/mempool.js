function createMempool(config) {
  const sortMode = (config.mempool?.sort ?? 'fee').toLowerCase();
  const pool = [];

  function addTx(tx) {
    pool.push({
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
      timestamp: tx.timestamp || new Date().toISOString()
    });
  }

  function list() {
    return pool.slice();
  }

  function getMaxNonce(address) {
    let max = null;
    for (const tx of pool) {
      if (tx.signer !== address) continue;
      const nonce = BigInt(tx.nonce || '0');
      if (max === null || nonce > max) max = nonce;
    }
    return max;
  }

  function getPendingSpend(address, startNonce) {
    if (startNonce === undefined || startNonce === null) {
      let total = 0n;
      for (const tx of pool) {
        if (tx.signer !== address) continue;
        total += BigInt(tx.amountMicro || '0') + BigInt(tx.feeMicro || '0') + BigInt(tx.bondMicro || '0');
      }
      return total;
    }

    const byNonce = new Map();
    for (const tx of pool) {
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
    const selectedIds = new Set(ids);
    const newPool = [];
    for (const tx of pool) {
      if (!selectedIds.has(tx.id)) newPool.push(tx);
    }
    pool.length = 0;
    pool.push(...newPool);
  }

  return { addTx, list, getMaxNonce, getPendingSpend, removeByIds, sortMode };
}

module.exports = { createMempool };
