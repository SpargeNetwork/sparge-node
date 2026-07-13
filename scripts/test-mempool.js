const assert = require('assert');
const {
  createMempool,
  estimateTxBytes,
  normalizeMempoolConfig
} = require('../server/lib/mempool');

function config(overrides = {}) {
  return {
    mempool: {
      sort: 'fee',
      maxTransactions: 10,
      maxBytes: 1000000,
      maxTransactionsPerSender: 10,
      transactionTtlSeconds: 60,
      maxFutureNonceGap: 100,
      minimumFeeMicro: '0',
      ...overrides
    }
  };
}

function tx(id, signer = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn', nonce = 0, memo = '') {
  return {
    id,
    txid: id,
    type: 'transfer',
    from: signer,
    to: 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd',
    signer,
    amountMicro: '1',
    feeMicro: '1000',
    bondMicro: '0',
    nonce: String(nonce),
    chainId: 'sparge-mainnet',
    publicKeyHex: 'a'.repeat(64),
    signatureHex: 'b'.repeat(128),
    memo,
    timestamp: '2026-01-01T00:00:00.000Z'
  };
}

function assertCode(fn, code, label) {
  assert.throws(fn, (err) => err && err.code === code, label);
}

(async () => {
  const now = Date.now();
  const base = createMempool(config({ maxTransactions: 2 }));
  base.addTx(tx('a'), { now });
  base.addTx(tx('b', 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd', 0), { now });
  assert.strictEqual(base.size(), 2, 'transactions under max count are accepted');
  assertCode(() => base.addTx(tx('c', 'spg_ojsJmWnCUdu8t4VWjU4CmiZkYPn', 0), { now }), 'MEMPOOL_FULL', 'transaction exceeding max count rejected');
  assert.strictEqual(base.size(), 2, 'failed admission does not change count');

  const one = tx('one');
  const oneBytes = estimateTxBytes(one);
  const exact = createMempool(config({ maxTransactions: 1, maxBytes: oneBytes }));
  exact.addTx(one, { now });
  assert.strictEqual(exact.getStats().mempoolBytes, oneBytes, 'exact byte boundary accepted');
  assert.strictEqual(exact.recomputeAccounting().ok, true, 'byte accounting invariant passes');

  const tooSmall = createMempool(config({ maxBytes: oneBytes - 1 }));
  assertCode(() => tooSmall.addTx(one, { now }), 'MEMPOOL_FULL', 'transaction exceeding max bytes rejected');
  assert.strictEqual(tooSmall.getStats().mempoolBytes, 0, 'failed byte admission does not change bytes');

  const senderPool = createMempool(config({ maxTransactionsPerSender: 2 }));
  senderPool.addTx(tx('s1', address(), 0), { now });
  senderPool.addTx(tx('s2', address(), 1), { now });
  assertCode(() => senderPool.addTx(tx('s3', address(), 2), { now }), 'MEMPOOL_SENDER_LIMIT', 'sender limit enforced');
  senderPool.addTx(tx('other1', 'spg_PHxAiV4Tp2VwPN3QHhGt7R7JXzQ', 0), { now });
  assert.strictEqual(senderPool.size(), 3, 'another sender remains able to submit');
  senderPool.removeByIds(['s1']);
  senderPool.addTx(tx('s3', address(), 2), { now });
  assert.strictEqual(senderPool.size(), 3, 'mining/removal frees sender capacity');

  const dupPool = createMempool(config());
  dupPool.addTx(tx('dup'), { now });
  const beforeDup = dupPool.getStats().mempoolBytes;
  assertCode(() => dupPool.addTx(tx('dup'), { now }), 'MEMPOOL_DUPLICATE', 'duplicate rejected');
  assert.strictEqual(dupPool.getStats().mempoolBytes, beforeDup, 'duplicate does not change bytes');

  const ttlPool = createMempool(config({ transactionTtlSeconds: 10, maxTransactionsPerSender: 1 }));
  ttlPool.addTx(tx('ttl1'), { now });
  assert.strictEqual(ttlPool.list({ now: now + 9000 }).length, 1, 'transaction remains before TTL');
  assert.strictEqual(ttlPool.list({ now: now + 11000 }).length, 0, 'transaction expires after TTL');
  assert.strictEqual(ttlPool.getStats().mempoolBytes, 0, 'expiry decreases bytes');
  ttlPool.addTx(tx('ttl2'), { now: now + 12000 });
  assert.strictEqual(ttlPool.size(), 1, 'expiry frees sender capacity');
  assert.strictEqual(ttlPool.recomputeAccounting().ok, true, 'cleanup removes all indexes');

  const removal = createMempool(config());
  removal.addTx(tx('rm1'), { now });
  const rmBytes = removal.getStats().mempoolBytes;
  assert.ok(rmBytes > 0, 'insertion increases bytes');
  assert.strictEqual(removal.removeByIds(['rm1']), 1, 'mined transaction removed exactly once');
  assert.strictEqual(removal.removeByIds(['rm1']), 0, 'repeated removal is safe');
  assert.strictEqual(removal.getStats().mempoolBytes, 0, 'mining decreases bytes');

  const concurrent = createMempool(config({ maxTransactions: 3, maxTransactionsPerSender: 3 }));
  const attempts = await Promise.allSettled([0, 1, 2, 3, 4].map((i) => Promise.resolve().then(() => {
    concurrent.addTx(tx(`cc${i}`, address(), i), { now });
  })));
  assert.strictEqual(attempts.filter((r) => r.status === 'fulfilled').length, 3, 'concurrent admissions do not exceed maxTransactions');
  assert.strictEqual(concurrent.size(), 3, 'concurrent count stays bounded');
  assert.strictEqual(concurrent.recomputeAccounting().ok, true, 'concurrent accounting remains consistent');

  const cfg = normalizeMempoolConfig(config({}).mempool ? config({}) : {});
  assert.strictEqual(cfg.maxTransactions, 10, 'test config normalization keeps configured maxTransactions');
  assert.throws(() => normalizeMempoolConfig({ mempool: { maxTransactions: 0 } }), /positive safe integer/, 'invalid zero maxTransactions rejected');
  assert.throws(() => normalizeMempoolConfig({ mempool: { maxBytes: -1 } }), /positive safe integer/, 'invalid negative maxBytes rejected');

  console.log('mempool tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function address() {
  return 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
}
