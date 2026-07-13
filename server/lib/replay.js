const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { createBlockchain } = require('./blockchain');
const { createMempool } = require('./mempool');
const { ensureGenesis, computeGenesisHash } = require('./genesis');
const { calculateStateRoot } = require('./invariants');
const { SqliteStorage } = require('../storage/sqliteStorage');

const REPLAY_VERSION = 1;
const ZERO_HASH = '0'.repeat(64);
const HASH_RE = /^[0-9a-f]{64}$/i;

class ReplayError extends Error {
  constructor(code, message, { height = null, category = 'chain', details = null } = {}) {
    super(message);
    this.name = 'ReplayError';
    this.code = code;
    this.height = height;
    this.category = category;
    this.details = details;
  }
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLedger(ledger) {
  const sortObject = (obj = {}) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  const participants = {};
  for (const [address, record] of Object.entries(ledger.participants || {}).sort(([a], [b]) => a.localeCompare(b))) {
    participants[address] = {
      sponsor: record.sponsor || '',
      bondMicro: String(record.bondMicro || '0'),
      registeredHeight: String(record.registeredHeight || '0'),
      lastSeenHeight: String(record.lastSeenHeight || '0')
    };
  }
  const balanceHistory = {};
  for (const [address, history] of Object.entries(ledger.balanceHistory || {}).sort(([a], [b]) => a.localeCompare(b))) {
    balanceHistory[address] = (history || [])
      .map((entry) => ({
        height: String(entry.height ?? '0'),
        balance: String(entry.balance ?? entry.balanceMicro ?? '0')
      }))
      .sort((a, b) => Number(a.height) - Number(b.height));
  }
  return {
    balances: sortObject(Object.fromEntries(Object.entries(ledger.balances || {}).map(([k, v]) => [k, String(v)]))),
    nonces: sortObject(Object.fromEntries(Object.entries(ledger.nonces || {}).map(([k, v]) => [k, String(v)]))),
    stakes: sortObject(Object.fromEntries(Object.entries(ledger.stakes || {}).map(([k, v]) => [k, String(v)]))),
    participants,
    balanceHistory
  };
}

function normalizeMeta(meta) {
  const keys = [
    'chainId',
    'genesisHash',
    'protocolVersion',
    'economicsVersion',
    'latestHeight',
    'latestHash',
    'totalSupplyUnits',
    'totalMintedUnits',
    'mintAcc',
    'baseFeeBaseUnits',
    'nodePoolUnits',
    'holderPoolUnits',
    'lastPayoutHeight',
    'lastMintUnits',
    'lastMintRatePpm',
    'lastParticipantUnits',
    'lastParticipantCount',
    'lastParticipantToTreasury',
    'lastNodePoolAdd',
    'lastHolderPoolAdd',
    'lastTreasuryUnits',
    'genesisFreeUsed'
  ];
  const out = {};
  for (const key of keys) {
    if (meta[key] !== undefined && meta[key] !== null) out[key] = String(meta[key]);
  }
  return out;
}

function digest(value) {
  return sha256(JSON.stringify(value));
}

function mapExternalCode(code, fallback = 'REPLAY_STORAGE_ERROR', message = '') {
  const mapping = {
    CHAIN_HEIGHT_MISMATCH: 'REPLAY_HEIGHT_GAP',
    CHAIN_ID_MISMATCH: 'REPLAY_GENESIS_MISMATCH',
    GENESIS_HASH_MISMATCH: 'REPLAY_GENESIS_MISMATCH',
    PROTOCOL_VERSION_MISMATCH: 'REPLAY_UNSUPPORTED_VERSION',
    ECONOMICS_VERSION_MISMATCH: 'REPLAY_UNSUPPORTED_VERSION',
    PREVIOUS_HASH_MISMATCH: 'REPLAY_PREVIOUS_HASH_MISMATCH',
    STATE_ROOT_MISMATCH: 'REPLAY_STATE_ROOT_MISMATCH',
    BLOCK_HASH_MISMATCH: 'REPLAY_BLOCK_HASH_MISMATCH',
    INVARIANT_FAILURE: 'REPLAY_STATE_ROOT_MISMATCH'
  };
  if (mapping[code]) return mapping[code];
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('reward') || normalized.includes('mint')) return 'REPLAY_REWARD_MISMATCH';
  if (normalized.includes('user tx') || normalized.includes('nonce')) return 'REPLAY_TXID_MISMATCH';
  if (normalized.includes('basefee')) return 'REPLAY_REWARD_MISMATCH';
  return fallback;
}

class ReadOnlyChainReader {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'state.db');
    if (!fs.existsSync(this.dbPath)) {
      throw new ReplayError('REPLAY_STORAGE_ERROR', 'Missing SQLite state.db.', { category: 'storage' });
    }
    const nativeBinding = process.env.BETTER_SQLITE3_BINDING || null;
    this.db = nativeBinding
      ? new Database(this.dbPath, { readonly: true, fileMustExist: true, nativeBinding })
      : new Database(this.dbPath, { readonly: true, fileMustExist: true });
  }

  close() {
    if (this.db) this.db.close();
  }

  integrityCheck() {
    const result = this.db.pragma('quick_check', { simple: true });
    if (result !== 'ok') {
      throw new ReplayError('REPLAY_STORAGE_ERROR', 'SQLite quick_check failed.', { category: 'storage' });
    }
  }

  readMeta() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM meta').all().map((row) => [row.key, row.value]));
  }

  readLedger() {
    const ledger = { balances: {}, nonces: {}, stakes: {}, participants: {}, balanceHistory: {} };
    for (const row of this.db.prepare('SELECT addr, balanceMicro, nonce FROM state_balances').all()) {
      ledger.balances[row.addr] = row.balanceMicro;
      ledger.nonces[row.addr] = row.nonce.toString();
    }
    for (const row of this.db.prepare('SELECT addr, stakeMicro FROM state_stakes').all()) {
      ledger.stakes[row.addr] = row.stakeMicro;
    }
    for (const row of this.db.prepare('SELECT addr, sponsorAddr, bondLockedMicro, registeredHeight, lastSeenHeight FROM participants').all()) {
      ledger.participants[row.addr] = {
        sponsor: row.sponsorAddr || '',
        bondMicro: row.bondLockedMicro || '0',
        registeredHeight: row.registeredHeight?.toString() ?? '0',
        lastSeenHeight: row.lastSeenHeight?.toString() ?? '0'
      };
    }
    for (const row of this.db.prepare('SELECT addr, height, balanceMicro FROM balance_history ORDER BY addr ASC, height ASC').all()) {
      if (!ledger.balanceHistory[row.addr]) ledger.balanceHistory[row.addr] = [];
      ledger.balanceHistory[row.addr].push({ height: row.height.toString(), balance: row.balanceMicro });
    }
    return ledger;
  }

  readPinnedSnapshot({ fromHeight = 0, toHeight = null } = {}) {
    return this.db.transaction(() => {
      const latest = this.db.prepare('SELECT height, hash, stateRoot, blockJson FROM blocks ORDER BY height DESC LIMIT 1').get();
      if (!latest) throw new ReplayError('REPLAY_STORAGE_ERROR', 'No blocks found in SQLite storage.', { category: 'storage' });
      const targetHeight = toHeight === null || toHeight === undefined ? Number(latest.height) : Number(toHeight);
      if (!Number.isSafeInteger(targetHeight) || targetHeight < 0 || targetHeight > Number(latest.height)) {
        throw new ReplayError('REPLAY_HEIGHT_GAP', 'Requested replay target height is invalid.', { height: targetHeight });
      }
      if (!Number.isSafeInteger(Number(fromHeight)) || Number(fromHeight) < 0 || Number(fromHeight) > targetHeight) {
        throw new ReplayError('REPLAY_HEIGHT_GAP', 'Requested replay start height is invalid.', { height: Number(fromHeight) });
      }
      const target = this.db.prepare('SELECT height, hash, stateRoot, blockJson FROM blocks WHERE height = ?').get(targetHeight);
      if (!target) throw new ReplayError('REPLAY_HEIGHT_GAP', 'Requested replay target block is missing.', { height: targetHeight });
      const rows = this.db.prepare('SELECT height, hash, stateRoot, blockJson FROM blocks WHERE height >= ? AND height <= ? ORDER BY height ASC')
        .all(Number(fromHeight), targetHeight);
      return {
        latest: { height: Number(latest.height), hash: latest.hash, stateRoot: latest.stateRoot },
        target: { height: Number(target.height), hash: target.hash, stateRoot: target.stateRoot },
        blocks: rows.map((row) => JSON.parse(row.blockJson)),
        meta: this.readMeta(),
        ledger: this.readLedger()
      };
    })();
  }
}

function verifyGenesis({ dataDir, config, genesis, genesisHash, genesisBlock }) {
  if (genesis.chainId !== config.chain.chainId) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis chainId does not match config.', { height: 0 });
  }
  if (genesis.protocolVersion !== config.chain.protocolVersion) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis protocolVersion does not match config.', { height: 0 });
  }
  if (genesis.economicsVersion !== config.chain.economicsVersion) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis economicsVersion does not match config.', { height: 0 });
  }
  const recomputed = computeGenesisHash({ ...genesis, genesisHash: undefined });
  if (genesis.genesisHash && genesis.genesisHash !== genesisHash) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis hash field does not match computed active hash.', { height: 0 });
  }
  if (genesis.genesisHash && genesis.genesisHash !== recomputed) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis hash field does not match deterministic genesis content.', { height: 0 });
  }
  const expectedOperator = config.mining?.genesisOperatorAddress || config.mining?.proposerAddress || '';
  if ((genesis.genesisOperatorAddress || '') !== expectedOperator) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis operator address does not match config.', { height: 0 });
  }
  if (Number(genesis.genesisFreeBlocks ?? 0) !== Number(config.mining?.genesisFreeBlocks ?? 100)) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Genesis free-block window does not match config.', { height: 0 });
  }
  if (!genesisBlock || genesisBlock.height !== 0 || genesisBlock.prevHash !== ZERO_HASH) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Stored genesis block is missing or malformed.', { height: 0 });
  }
  if (genesisBlock.chainId !== config.chain.chainId || genesisBlock.genesisHash !== genesisHash) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Stored genesis block chain identity does not match genesis.', { height: 0 });
  }
  if (genesisBlock.protocolVersion !== config.chain.protocolVersion || genesisBlock.economicsVersion !== config.chain.economicsVersion) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Stored genesis block version does not match config.', { height: 0 });
  }
  if (calculateStateRoot({ balances: {}, stakes: {} }) !== genesisBlock.stateRoot) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Stored genesis state root does not match empty initial state.', { height: 0 });
  }
  if (!fs.existsSync(path.join(dataDir, 'genesis.json'))) {
    throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'genesis.json is missing.', { height: 0 });
  }
}

function precheckBlock(block, previous, expectedHeight, seenTxs) {
  const height = Number(block?.height);
  if (!Number.isSafeInteger(height) || height !== expectedHeight) {
    throw new ReplayError('REPLAY_HEIGHT_GAP', `Expected block height ${expectedHeight}.`, { height });
  }
  if (typeof block.hash !== 'string' || !HASH_RE.test(block.hash)) {
    throw new ReplayError('REPLAY_BLOCK_HASH_MISMATCH', 'Block hash is malformed.', { height });
  }
  if (!block.header || sha256(block.header) !== block.hash) {
    throw new ReplayError('REPLAY_BLOCK_HASH_MISMATCH', 'Block hash does not recompute from header.', { height });
  }
  let header;
  try {
    header = JSON.parse(block.header);
  } catch {
    throw new ReplayError('REPLAY_BLOCK_HASH_MISMATCH', 'Block header is not valid JSON.', { height });
  }
  if (header.height !== block.height || header.prevHash !== block.prevHash || header.prevStateRoot !== block.prevStateRoot) {
    throw new ReplayError('REPLAY_BLOCK_HASH_MISMATCH', 'Header fields do not match block fields.', { height });
  }
  const expectedPrev = height === 0 ? ZERO_HASH : previous?.hash;
  if (block.prevHash !== expectedPrev) {
    throw new ReplayError('REPLAY_PREVIOUS_HASH_MISMATCH', 'Block prevHash does not match previous block hash.', { height });
  }
  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  if (block.txCount !== undefined && Number(block.txCount) !== txs.length) {
    throw new ReplayError('REPLAY_TXID_MISMATCH', 'Block txCount does not match transaction count.', { height, category: 'transactions' });
  }
  const inBlock = new Set();
  for (const tx of txs) {
    const txid = tx?.txid || tx?.id || '';
    if (!txid) {
      throw new ReplayError('REPLAY_TXID_MISMATCH', 'Transaction is missing txid/id.', { height, category: 'transactions' });
    }
    if (inBlock.has(txid) || seenTxs.has(txid)) {
      throw new ReplayError('REPLAY_TXID_MISMATCH', 'Duplicate transaction id detected.', { height, category: 'transactions' });
    }
    inBlock.add(txid);
    seenTxs.add(txid);
  }
}

function writeReport(reportPath, report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
}

function buildFailureReport(base, err, startedAtMs) {
  return {
    ...base,
    completedAt: new Date().toISOString(),
    success: false,
    durationMs: Date.now() - startedAtMs,
    error: {
      code: err.code || 'REPLAY_STORAGE_ERROR',
      height: err.height ?? null,
      category: err.category || 'chain',
      message: err.message
    }
  };
}

function compareTipState({ expectedLedger, replayLedger, expectedMeta, replayMeta, expectedBlock, replayBlock }) {
  const expectedLedgerNormalized = normalizeLedger(expectedLedger);
  const replayLedgerNormalized = normalizeLedger(replayLedger);
  if (digest(expectedLedgerNormalized) !== digest(replayLedgerNormalized)) {
    throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Replayed ledger does not match persisted canonical ledger.', {
      height: expectedBlock?.height ?? null,
      category: 'state',
      details: { expectedDigest: digest(expectedLedgerNormalized), replayedDigest: digest(replayLedgerNormalized) }
    });
  }
  const expectedMetaNormalized = normalizeMeta(expectedMeta);
  const replayMetaNormalized = normalizeMeta(replayMeta);
  if (digest(expectedMetaNormalized) !== digest(replayMetaNormalized)) {
    throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Replayed metadata does not match persisted canonical metadata.', {
      height: expectedBlock?.height ?? null,
      category: 'state',
      details: { expectedDigest: digest(expectedMetaNormalized), replayedDigest: digest(replayMetaNormalized) }
    });
  }
  if (expectedBlock?.hash !== replayBlock?.hash) {
    throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Replayed latest block hash does not match persisted tip.', { height: expectedBlock?.height ?? null });
  }
  if (expectedBlock?.stateRoot !== replayBlock?.stateRoot) {
    throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Replayed latest state root does not match persisted tip.', { height: expectedBlock?.height ?? null });
  }
}

async function runReplay(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, '..', 'data'));
  const config = cloneConfig(options.config);
  if (!config || !config.chain) throw new ReplayError('REPLAY_STORAGE_ERROR', 'Replay config is missing.', { category: 'config' });
  const fromHeight = Number(options.fromHeight ?? 0);
  const toHeight = options.toHeight === undefined || options.toHeight === null || options.toHeight === ''
    ? null
    : Number(options.toHeight);
  const progressEvery = Math.max(0, Number(options.progressEvery || 0));
  const reportPath = options.report ? path.resolve(options.report) : null;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const baseReport = {
    replayVersion: REPLAY_VERSION,
    mode: options.verifyTipOnly ? 'tip-only' : 'full',
    startedAt,
    completedAt: null,
    chainId: config.chain.chainId,
    genesisHash: null,
    fromHeight,
    toHeight: null,
    blocksVerified: 0,
    transactionsVerified: 0,
    expectedTipHash: null,
    replayedTipHash: null,
    expectedStateRoot: null,
    replayedStateRoot: null,
    success: false,
    durationMs: 0
  };

  let reader;
  let tempDir = null;
  let tempStorage = null;
  try {
    reader = new ReadOnlyChainReader(dataDir);
    reader.integrityCheck();
    const snapshot = reader.readPinnedSnapshot({ fromHeight, toHeight });
    if (!options.verifyTipOnly && snapshot.target.height !== snapshot.latest.height) {
      baseReport.mode = 'partial';
    }
    const genesis = safeReadJson(path.join(dataDir, 'genesis.json'));
    const genesisHash = genesis.genesisHash || computeGenesisHash(genesis);
    const genesisBlock = fromHeight === 0 ? snapshot.blocks[0] : reader.db.prepare('SELECT blockJson FROM blocks WHERE height = 0').get();
    const parsedGenesisBlock = genesisBlock?.blockJson ? JSON.parse(genesisBlock.blockJson) : genesisBlock;
    verifyGenesis({ dataDir, config, genesis, genesisHash, genesisBlock: parsedGenesisBlock });

    baseReport.genesisHash = genesisHash;
    baseReport.toHeight = snapshot.target.height;
    baseReport.expectedTipHash = snapshot.target.hash;
    baseReport.expectedStateRoot = snapshot.target.stateRoot;
    if (typeof options.afterSnapshot === 'function') {
      await options.afterSnapshot({
        targetHeight: snapshot.target.height,
        targetHash: snapshot.target.hash,
        latestHeight: snapshot.latest.height,
        latestHash: snapshot.latest.hash
      });
    }

    if (options.verifyTipOnly) {
      const latestBlock = JSON.parse(reader.db.prepare('SELECT blockJson FROM blocks WHERE height = ?').get(snapshot.target.height).blockJson);
      if (snapshot.meta.latestHash !== snapshot.latest.hash || Number(snapshot.meta.latestHeight) !== Number(snapshot.latest.height)) {
        throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Persisted latest meta does not match latest stored block.', { height: snapshot.latest.height, category: 'storage' });
      }
      const stateRoot = calculateStateRoot(snapshot.ledger);
      if (stateRoot !== latestBlock.stateRoot) {
        throw new ReplayError('REPLAY_STATE_ROOT_MISMATCH', 'Persisted ledger state root does not match pinned tip.', { height: latestBlock.height, category: 'state' });
      }
      const report = {
        ...baseReport,
        completedAt: new Date().toISOString(),
        blocksVerified: 1,
        transactionsVerified: Array.isArray(latestBlock.transactions) ? latestBlock.transactions.length : 0,
        replayedTipHash: latestBlock.hash,
        replayedStateRoot: stateRoot,
        success: true,
        durationMs: Date.now() - startedAtMs,
        memory: process.memoryUsage()
      };
      writeReport(reportPath, report);
      return report;
    }

    if (fromHeight !== 0) {
      throw new ReplayError('REPLAY_HEIGHT_GAP', 'Partial replay is supported for diagnostics only; full-chain verification must start at height 0.', { height: fromHeight });
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparge-replay-'));
    fs.copyFileSync(path.join(dataDir, 'genesis.json'), path.join(tempDir, 'genesis.json'));
    const replayConfig = cloneConfig(config);
    replayConfig.invariants = {
      ...(replayConfig.invariants || {}),
      enabled: false,
      fullAuditOnStartup: false,
      fastChecksEveryBlock: false
    };
    tempStorage = new SqliteStorage(tempDir, replayConfig);
    const replayChain = createBlockchain(replayConfig, createMempool(replayConfig), tempStorage, tempDir);

    const seenTxs = new Set();
    let previous = null;
    let transactionsVerified = 0;
    let lastBlock = null;
    const progress = typeof options.onProgress === 'function' ? options.onProgress : null;

    for (let i = 0; i < snapshot.blocks.length; i += 1) {
      const block = snapshot.blocks[i];
      const height = Number(block.height);
      precheckBlock(block, previous, i, seenTxs);
      if (height === 0) {
        const replayGenesis = replayChain.getBlockByHeight(0);
        if (replayGenesis.hash !== block.hash || replayGenesis.stateRoot !== block.stateRoot) {
          throw new ReplayError('REPLAY_GENESIS_MISMATCH', 'Replay genesis block does not match persisted genesis block.', { height: 0 });
        }
      } else {
        const result = replayChain.applyExternalBlock(block);
        if (!result.ok) {
          throw new ReplayError(mapExternalCode(result.code, 'REPLAY_STORAGE_ERROR', result.error), result.error || 'External block validation failed.', {
            height: result.height ?? height,
            category: result.code === 'STATE_ROOT_MISMATCH' ? 'state' : 'chain'
          });
        }
      }
      transactionsVerified += Array.isArray(block.transactions) ? block.transactions.length : 0;
      previous = block;
      lastBlock = block;
      if (progressEvery > 0 && progress && height > 0 && height % progressEvery === 0) {
        const elapsedSeconds = Math.max(0.001, (Date.now() - startedAtMs) / 1000);
        progress({
          height,
          targetHeight: snapshot.target.height,
          blocksPerSecond: Number((height / elapsedSeconds).toFixed(2)),
          transactionsPerSecond: Number((transactionsVerified / elapsedSeconds).toFixed(2))
        });
      }
    }

    const replayMeta = tempStorage.loadMeta();
    const replayLedger = tempStorage.loadLedger();
    const replayTip = tempStorage.getLatestBlock();
    if (snapshot.target.height === snapshot.latest.height) {
      compareTipState({
        expectedLedger: snapshot.ledger,
        replayLedger,
        expectedMeta: snapshot.meta,
        replayMeta,
        expectedBlock: lastBlock,
        replayBlock: replayTip
      });
    } else if (lastBlock?.hash !== replayTip?.hash || lastBlock?.stateRoot !== replayTip?.stateRoot) {
      throw new ReplayError('REPLAY_TIP_STATE_MISMATCH', 'Partial replay tip does not match selected target block.', { height: lastBlock?.height ?? null });
    }

    const report = {
      ...baseReport,
      completedAt: new Date().toISOString(),
      blocksVerified: snapshot.blocks.length,
      transactionsVerified,
      replayedTipHash: replayTip.hash,
      replayedStateRoot: calculateStateRoot(replayLedger),
      success: true,
      durationMs: Date.now() - startedAtMs,
      memory: process.memoryUsage()
    };
    writeReport(reportPath, report);
    return report;
  } catch (err) {
    const replayErr = err instanceof ReplayError
      ? err
      : new ReplayError('REPLAY_STORAGE_ERROR', err.message || String(err), { category: 'storage' });
    const report = buildFailureReport(baseReport, replayErr, startedAtMs);
    writeReport(reportPath, report);
    throw Object.assign(replayErr, { report });
  } finally {
    if (tempStorage) tempStorage.close();
    if (reader) reader.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readReplayStatus(dataDir) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(dataDir, 'replay-status.json'), 'utf8'));
    const at = status.lastReplayAt || null;
    const ageSeconds = at ? Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000)) : null;
    return {
      lastReplayAt: at,
      lastReplayHeight: status.lastReplayHeight ?? null,
      lastReplaySuccess: status.lastReplaySuccess === true,
      replayAgeSeconds: Number.isFinite(ageSeconds) ? ageSeconds : null
    };
  } catch {
    return { lastReplayAt: null, lastReplayHeight: null, lastReplaySuccess: null, replayAgeSeconds: null };
  }
}

module.exports = {
  REPLAY_VERSION,
  ReplayError,
  ReadOnlyChainReader,
  runReplay,
  readReplayStatus,
  normalizeLedger,
  normalizeMeta
};
