const crypto = require('crypto');

const ZERO_HASH = '0'.repeat(64);
const USER_TX_TYPES = new Set(['transfer', 'register_participant', 'unregister_participant', 'heartbeat']);
const REWARD_TX_TYPES = new Set([
  'participant_reward',
  'node_pool_accrual',
  'node_reward',
  'node_leftover',
  'node_empty',
  'holder_pool_accrual',
  'holder_reward',
  'holder_leftover',
  'holder_empty',
  'treasury_reward'
]);
const ADDRESS_RE = /^spg_[1-9A-HJ-NP-Za-km-z]{20,40}$/;
const MAX_SAFE_UNITS = 10n ** 36n;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function calculateStateRoot(ledger) {
  const balances = Object.entries(ledger.balances || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, value]) => `${address}:${value.toString()}`);
  const stakes = Object.entries(ledger.stakes || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, value]) => `${address}:${value.toString()}`);
  const participants = Object.entries(ledger.participants || {})
    .map(([address, record]) => {
      const sponsor = record.sponsor || '';
      const bond = record.bondMicro || '0';
      const registered = record.registeredHeight || '0';
      const lastSeen = record.lastSeenHeight || '0';
      return `${address}:${sponsor}:${bond}:${registered}:${lastSeen}`;
    })
    .sort((a, b) => a.localeCompare(b));
  const canonical = `balances|${balances.join('|')}|stakes|${stakes.join('|')}|participants|${participants.join('|')}`;
  return sha256(canonical);
}

function issue(code, message, { category = 'chain', height = null, severity = 'error' } = {}) {
  return { code, message, category, height, severity };
}

function safeBigInt(value, code, message, ctx, issues) {
  try {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new Error('unsafe number');
      return BigInt(value);
    }
    if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value)) throw new Error('not integer string');
    return BigInt(value);
  } catch {
    issues.push(issue(code, message, ctx));
    return 0n;
  }
}

function getTxId(tx) {
  return tx?.txid || tx?.id || '';
}

function validateBlockStructure(block, index, previous, config, genesisHash, seenHeights, seenHashes, seenTxs, issues) {
  const height = Number(block.height);
  if (!Number.isSafeInteger(height) || height < 0) {
    issues.push(issue('CHAIN_HEIGHT_MISMATCH', 'Block height must be a non-negative safe integer.', { height: block.height }));
    return;
  }
  if (height !== index) {
    issues.push(issue('CHAIN_HEIGHT_MISMATCH', `Expected block height ${index}.`, { height }));
  }
  if (seenHeights.has(height)) {
    issues.push(issue('CHAIN_HEIGHT_MISMATCH', 'Duplicate block height.', { height }));
  }
  seenHeights.add(height);

  if (typeof block.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(block.hash)) {
    issues.push(issue('BLOCK_HASH_MISMATCH', 'Block hash is malformed.', { height }));
  } else if (seenHashes.has(block.hash)) {
    issues.push(issue('BLOCK_HASH_MISMATCH', 'Duplicate block hash.', { height }));
  }
  if (block.hash) seenHashes.add(block.hash);

  if (block.chainId !== config.chain.chainId) issues.push(issue('CHAIN_ID_MISMATCH', 'Block chainId does not match config.', { height }));
  if (block.genesisHash !== genesisHash) issues.push(issue('GENESIS_HASH_MISMATCH', 'Block genesisHash does not match genesis.', { height }));
  if (block.protocolVersion !== config.chain.protocolVersion) issues.push(issue('PROTOCOL_VERSION_MISMATCH', 'Block protocolVersion does not match config.', { height }));
  if (block.economicsVersion !== config.chain.economicsVersion) issues.push(issue('ECONOMICS_VERSION_MISMATCH', 'Block economicsVersion does not match config.', { height }));

  const expectedPrevHash = height === 0 ? ZERO_HASH : previous?.hash;
  if (block.prevHash !== expectedPrevHash) {
    issues.push(issue('PREVIOUS_HASH_MISMATCH', 'Block prevHash does not match previous block hash.', { height }));
  }

  if (!block.header) {
    issues.push(issue('BLOCK_HASH_MISMATCH', 'Block header is missing.', { height }));
  } else {
    try {
      const computed = sha256(block.header);
      if (computed !== block.hash) issues.push(issue('BLOCK_HASH_MISMATCH', 'Block hash does not recompute from header.', { height }));
      const header = JSON.parse(block.header);
      if (header.height !== block.height || header.prevHash !== block.prevHash || header.prevStateRoot !== block.prevStateRoot) {
        issues.push(issue('BLOCK_HASH_MISMATCH', 'Header fields do not match block fields.', { height }));
      }
      if (header.chainId !== block.chainId || header.protocolVersion !== block.protocolVersion || header.economicsVersion !== block.economicsVersion) {
        issues.push(issue('BLOCK_HASH_MISMATCH', 'Header chain fields do not match block fields.', { height }));
      }
    } catch {
      issues.push(issue('BLOCK_HASH_MISMATCH', 'Block header is not valid JSON.', { height }));
    }
  }

  const time = new Date(block.timestamp).getTime();
  if (!Number.isFinite(time)) {
    issues.push(issue('TIMESTAMP_INVALID', 'Block timestamp is invalid.', { height }));
  } else if (previous) {
    const previousTime = new Date(previous.timestamp).getTime();
    if (Number.isFinite(previousTime) && time < previousTime) {
      issues.push(issue('TIMESTAMP_INVALID', 'Block timestamp is earlier than previous block timestamp.', { height }));
    }
  }

  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  if (block.txCount !== undefined && Number(block.txCount) !== txs.length) {
    issues.push(issue('TX_COUNT_MISMATCH', 'Block txCount does not match transactions length.', { height, category: 'transactions' }));
  }
  const blockTxs = new Set();
  for (const tx of txs) {
    const txid = getTxId(tx);
    if (!txid) continue;
    if (blockTxs.has(txid)) issues.push(issue('DUPLICATE_CONFIRMED_TX', 'Duplicate transaction hash within block.', { height, category: 'transactions' }));
    blockTxs.add(txid);
    if (seenTxs.has(txid)) issues.push(issue('DUPLICATE_CONFIRMED_TX', 'Transaction hash already confirmed earlier.', { height, category: 'transactions' }));
    seenTxs.add(txid);
    if (USER_TX_TYPES.has(tx.type) === false && REWARD_TX_TYPES.has(tx.type) === false) {
      issues.push(issue('INVALID_TX_TYPE', 'Committed transaction has unsupported type.', { height, category: 'transactions' }));
    }
    if (tx.nonce !== undefined && tx.nonce !== null) {
      const nonce = safeBigInt(String(tx.nonce), 'NONCE_REGRESSION', 'Transaction nonce is invalid.', { height, category: 'transactions' }, issues);
      if (nonce < 0n) issues.push(issue('NONCE_REGRESSION', 'Transaction nonce is negative.', { height, category: 'transactions' }));
    }
  }
}

function auditLedger(ledger, meta, latestBlock, issues) {
  let balanceSum = 0n;
  for (const [address, raw] of Object.entries(ledger.balances || {})) {
    const value = safeBigInt(String(raw), 'NEGATIVE_BALANCE', 'Balance is not an integer string.', { category: 'balances' }, issues);
    if (value < 0n) issues.push(issue('NEGATIVE_BALANCE', 'Account balance is negative.', { category: 'balances' }));
    if (value > MAX_SAFE_UNITS) issues.push(issue('SUPPLY_MISMATCH', 'Account balance exceeds safe bounds.', { category: 'balances' }));
    if (address && typeof address !== 'string') issues.push(issue('STORAGE_STATE_MISMATCH', 'Balance address key is invalid.', { category: 'balances' }));
    balanceSum += value;
  }
  const totalSupply = safeBigInt(String(meta.totalSupplyUnits || '0'), 'SUPPLY_MISMATCH', 'Meta total supply is invalid.', { category: 'supply' }, issues);
  const totalMinted = safeBigInt(String(meta.totalMintedUnits || '0'), 'SUPPLY_MISMATCH', 'Meta total minted supply is invalid.', { category: 'supply' }, issues);
  if (totalSupply < 0n || totalMinted < 0n || totalMinted > totalSupply) {
    issues.push(issue('SUPPLY_MISMATCH', 'Meta supply counters are inconsistent.', { category: 'supply' }));
  }
  if (balanceSum > totalSupply) {
    issues.push(issue('SUPPLY_MISMATCH', 'Ledger balance sum exceeds meta total supply.', { category: 'supply' }));
  }
  for (const [address, raw] of Object.entries(ledger.nonces || {})) {
    const nonce = safeBigInt(String(raw), 'NONCE_REGRESSION', 'Ledger nonce is invalid.', { category: 'transactions' }, issues);
    if (nonce < 0n) issues.push(issue('NONCE_REGRESSION', 'Ledger nonce is negative.', { category: 'transactions' }));
    if (address && typeof address !== 'string') issues.push(issue('STORAGE_STATE_MISMATCH', 'Nonce address key is invalid.', { category: 'storage' }));
  }
  for (const [address, record] of Object.entries(ledger.participants || {})) {
    if (!ADDRESS_RE.test(address)) issues.push(issue('PARTICIPANT_STATE_INVALID', 'Participant address is malformed.', { category: 'participants' }));
    if (record.sponsor && !ADDRESS_RE.test(record.sponsor)) issues.push(issue('PARTICIPANT_STATE_INVALID', 'Participant sponsor address is malformed.', { category: 'participants' }));
    const bond = safeBigInt(String(record.bondMicro || '0'), 'PARTICIPANT_STATE_INVALID', 'Participant bond is invalid.', { category: 'participants' }, issues);
    if (bond < 0n) issues.push(issue('PARTICIPANT_STATE_INVALID', 'Participant bond is negative.', { category: 'participants' }));
    const registered = safeBigInt(String(record.registeredHeight || '0'), 'PARTICIPANT_STATE_INVALID', 'Participant registeredHeight is invalid.', { category: 'participants' }, issues);
    const lastSeen = safeBigInt(String(record.lastSeenHeight || '0'), 'PARTICIPANT_STATE_INVALID', 'Participant lastSeenHeight is invalid.', { category: 'participants' }, issues);
    if (registered < 0n || lastSeen < 0n || lastSeen < registered) {
      issues.push(issue('PARTICIPANT_STATE_INVALID', 'Participant height state is invalid.', { category: 'participants' }));
    }
  }
  if (latestBlock && calculateStateRoot(ledger) !== latestBlock.stateRoot) {
    issues.push(issue('STATE_ROOT_MISMATCH', 'Current ledger state root does not match latest block.', { height: latestBlock.height, category: 'state' }));
  }
}

function auditMempool(mempool, issues) {
  if (!mempool || typeof mempool.recomputeAccounting !== 'function') return;
  const result = mempool.recomputeAccounting();
  if (!result.ok) {
    issues.push(issue('MEMPOOL_ACCOUNTING_MISMATCH', 'Mempool accounting invariant failed.', { category: 'mempool' }));
  }
}

function auditStorage(storage, latestBlock, meta, issues) {
  if (!storage) return;
  if (latestBlock && Number(meta.latestHeight || 0) !== Number(latestBlock.height)) {
    issues.push(issue('STORAGE_STATE_MISMATCH', 'Meta latestHeight does not match latest block.', { height: latestBlock.height, category: 'storage' }));
  }
  if (latestBlock && meta.latestHash !== latestBlock.hash) {
    issues.push(issue('STORAGE_STATE_MISMATCH', 'Meta latestHash does not match latest block.', { height: latestBlock.height, category: 'storage' }));
  }
  if (typeof storage.checkIntegrity === 'function') {
    const result = storage.checkIntegrity();
    if (!result.ok) issues.push(issue('DATABASE_INTEGRITY_FAILURE', 'Database integrity check failed.', { category: 'storage' }));
  }
}

function runFullInvariantAudit({ blocks, ledger, meta, config, genesisHash, mempool, storage }) {
  const issues = [];
  const ordered = Array.isArray(blocks) ? blocks.slice().sort((a, b) => Number(a.height) - Number(b.height)) : [];
  const seenHeights = new Set();
  const seenHashes = new Set();
  const seenTxs = new Set();
  for (let i = 0; i < ordered.length; i += 1) {
    validateBlockStructure(ordered[i], i, ordered[i - 1] || null, config, genesisHash, seenHeights, seenHashes, seenTxs, issues);
    if (i === 0 && ordered[i].prevHash !== ZERO_HASH) {
      issues.push(issue('GENESIS_HASH_MISMATCH', 'Genesis block prevHash is not zero.', { height: ordered[i].height }));
    }
  }
  const latestBlock = ordered.length ? ordered[ordered.length - 1] : null;
  auditLedger(ledger || {}, meta || {}, latestBlock, issues);
  auditMempool(mempool, issues);
  auditStorage(storage, latestBlock, meta || {}, issues);
  return {
    ok: issues.length === 0,
    issues,
    errors: issues.map((item) => `${item.code}: ${item.message}`),
    checkedAt: new Date().toISOString(),
    checkedHeight: latestBlock ? latestBlock.height : null
  };
}

function runFastBlockInvariant({ block, previousBlock, ledger, meta, config, genesisHash, mempool }) {
  const issues = [];
  const seenHeights = new Set(previousBlock ? [Number(previousBlock.height)] : []);
  const seenHashes = new Set(previousBlock?.hash ? [previousBlock.hash] : []);
  const seenTxs = new Set();
  validateBlockStructure(block, Number(block.height), previousBlock || null, config, genesisHash, seenHeights, seenHashes, seenTxs, issues);
  if (calculateStateRoot(ledger || {}) !== block.stateRoot) {
    issues.push(issue('STATE_ROOT_MISMATCH', 'Candidate block stateRoot does not match candidate ledger.', { height: block.height, category: 'state' }));
  }
  auditLedger(ledger || {}, meta || {}, block, issues);
  auditMempool(mempool, issues);
  return {
    ok: issues.length === 0,
    issues,
    errors: issues.map((item) => `${item.code}: ${item.message}`),
    checkedAt: new Date().toISOString(),
    checkedHeight: block?.height ?? null
  };
}

module.exports = {
  calculateStateRoot,
  runFullInvariantAudit,
  runFastBlockInvariant
};
