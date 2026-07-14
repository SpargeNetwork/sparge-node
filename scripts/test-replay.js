const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const YAML = require('yaml');
const { createBlockchain } = require('../server/lib/blockchain');
const { createMempool } = require('../server/lib/mempool');
const { SqliteStorage } = require('../server/storage/sqliteStorage');
const { runReplay } = require('../server/lib/replay');
const { rebuildBalanceHistory } = require('../server/lib/balanceHistoryRepair');
const { createBackup, restoreBackup, verifyBackupArchive } = require('../server/lib/backup');

const ADDRESS_A = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const ADDRESS_B = 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd';
const ADDRESS_C = 'spg_ojsJmWnCUdu8t4VWjU4CmiZkYPn';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function config() {
  return {
    chain: {
      name: 'Sparge Replay Test',
      symbol: 'SPG',
      chainId: 'sparge-replay-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0',
      blockTimeSeconds: 2,
      genesisCreatedAt: '2026-01-01T00:00:00.000Z'
    },
    token: { decimals: 6, initialSupplyTokens: '1000' },
    mining: { proposerAddress: ADDRESS_A, genesisOperatorAddress: ADDRESS_A, genesisFreeBlocks: 10 },
    rewards: { treasuryAddress: ADDRESS_B, nodePoolAddress: ADDRESS_A, holderPoolAddress: ADDRESS_C },
    storage: { backend: 'sqlite', blocksPerFile: 100 },
    gas: { blockLimit: 510, targetRatioBps: 8000, baseFeeChangeDenominator: 8, baseFeeInitialMicro: '0', minBaseFeeMicro: '0' },
    tx: { minFeeMicro: '0' },
    mempool: {
      sort: 'fee',
      maxTransactions: 100,
      maxBytes: 1000000,
      maxTransactionsPerSender: 10,
      transactionTtlSeconds: 60,
      maxFutureNonceGap: 100,
      minimumFeeMicro: '0'
    },
    invariants: {
      enabled: true,
      fastChecksEveryBlock: true,
      fullAuditOnStartup: true,
      fullAuditIntervalBlocks: 0,
      stopMiningOnFailure: true
    },
    network: { heartbeatIntervalSeconds: 60, observerOfflineAfterSeconds: 180 },
    operatorDashboard: { enabled: false, bindLocalOnly: true },
    logging: { level: 'error', format: 'json', directory: 'logs', fileEnabled: false, consoleEnabled: false }
  };
}

function clean(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

function openDb(dataDir) {
  return new Database(path.join(dataDir, 'state.db'));
}

function mutateBlock(dataDir, height, mutate) {
  const db = openDb(dataDir);
  try {
    const row = db.prepare('SELECT blockJson FROM blocks WHERE height = ?').get(height);
    assert.ok(row, `block ${height} exists`);
    const block = JSON.parse(row.blockJson);
    mutate(block);
    db.prepare('UPDATE blocks SET blockJson = ? WHERE height = ?').run(JSON.stringify(block), height);
  } finally {
    db.close();
  }
}

async function expectReplayFailure(dataDir, cfg, code, height = null) {
  try {
    await runReplay({ dataDir, config: cfg, progressEvery: 0, writeStatus: false });
  } catch (err) {
    assert.strictEqual(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    if (height !== null) assert.strictEqual(Number(err.height), Number(height), 'failure height matches');
    assert.ok(err.report, 'failure has safe report');
    return err;
  }
  assert.fail(`expected replay failure ${code}`);
}

function writeConfig(filePath, cfg) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(cfg), 'utf8');
}

(async () => {
  const root = path.join(__dirname, 'out', 'test-replay');
  clean(root);
  const cfg = config();
  const sourceDir = path.join(root, 'source');
  const storage = new SqliteStorage(sourceDir, cfg);
  const mempool = createMempool(cfg);
  const chain = createBlockchain(cfg, mempool, storage, sourceDir);
  for (let i = 0; i < 4; i += 1) {
    const block = chain.mineNextBlock();
    assert.ok(block, `block ${i + 1} mined`);
  }
  const originalState = chain.getState();
  storage.close();

  const persisted = openDb(sourceDir);
  try {
    const invalidHistory = persisted.prepare(
      "SELECT COUNT(*) AS count FROM balance_history WHERE balanceMicro = 'undefined'"
    ).get();
    assert.strictEqual(invalidHistory.count, 0, 'balance history persists canonical balances');
  } finally {
    persisted.close();
  }

  const restartedStorage = new SqliteStorage(sourceDir, cfg);
  const restartedLedger = restartedStorage.loadLedger();
  for (const history of Object.values(restartedLedger.balanceHistory)) {
    for (const entry of history) {
      assert.match(entry.balanceMicro, /^(0|[1-9][0-9]*)$/, 'reloaded history uses balanceMicro');
      assert.strictEqual(entry.balance, undefined, 'legacy balance field is not reintroduced');
    }
  }
  restartedStorage.saveLedger(restartedLedger);
  restartedStorage.close();

  const corruptDb = openDb(sourceDir);
  try {
    corruptDb.prepare("UPDATE balance_history SET balanceMicro = 'undefined'").run();
  } finally {
    corruptDb.close();
  }
  const repair = rebuildBalanceHistory({ dataDir: sourceDir, config: cfg, apply: true });
  assert.strictEqual(repair.applied, true, 'balance history repair is explicitly applied');
  const repairedDb = openDb(sourceDir);
  try {
    const invalidHistory = repairedDb.prepare(
      "SELECT COUNT(*) AS count FROM balance_history WHERE balanceMicro = 'undefined'"
    ).get();
    assert.strictEqual(invalidHistory.count, 0, 'deterministic replay repairs corrupted history');
  } finally {
    repairedDb.close();
  }

  const reportPath = path.join(root, 'replay-report.json');
  const replayA = await runReplay({ dataDir: sourceDir, config: cfg, report: reportPath, progressEvery: 0 });
  assert.strictEqual(replayA.success, true, 'multi-block chain replays');
  assert.strictEqual(replayA.mode, 'full', 'default replay is full mode');
  assert.strictEqual(replayA.toHeight, Number(originalState.latestHeight), 'replay target height matches source');
  assert.strictEqual(replayA.expectedTipHash, originalState.latestHash, 'expected tip hash matches source');
  assert.strictEqual(replayA.replayedTipHash, originalState.latestHash, 'replayed tip hash matches source');
  assert.strictEqual(replayA.expectedStateRoot, replayA.replayedStateRoot, 'state root matches');
  assert.ok(fs.existsSync(reportPath), 'JSON report is written');
  const reportRaw = fs.readFileSync(reportPath, 'utf8');
  assert.ok(!reportRaw.includes(root), 'report does not contain local paths');
  assert.ok(!reportRaw.includes('signatureHex'), 'report does not dump transaction signatures');

  const replayB = await runReplay({ dataDir: sourceDir, config: cfg, progressEvery: 0 });
  assert.strictEqual(replayB.replayedTipHash, replayA.replayedTipHash, 'replay is deterministic across runs');
  assert.strictEqual(replayB.replayedStateRoot, replayA.replayedStateRoot, 'state root is deterministic across runs');

  const tipOnly = await runReplay({ dataDir: sourceDir, config: cfg, verifyTipOnly: true, progressEvery: 0 });
  assert.strictEqual(tipOnly.success, true, 'tip-only verification succeeds');
  assert.strictEqual(tipOnly.mode, 'tip-only', 'tip-only mode is explicit');

  const partial = await runReplay({ dataDir: sourceDir, config: cfg, toHeight: 2, progressEvery: 0 });
  assert.strictEqual(partial.success, true, 'partial diagnostic replay succeeds');
  assert.strictEqual(partial.mode, 'partial', 'partial replay is not labeled full-chain');

  const beforeStat = fs.statSync(path.join(sourceDir, 'state.db')).mtimeMs;
  await runReplay({ dataDir: sourceDir, config: cfg, progressEvery: 0 });
  const afterStat = fs.statSync(path.join(sourceDir, 'state.db')).mtimeMs;
  assert.strictEqual(afterStat, beforeStat, 'replay does not modify source SQLite file');
  assert.ok(!fs.existsSync(path.join(sourceDir, 'replay-status.json')), 'replay does not write status into active data dir');

  const fixedTipDir = path.join(root, 'fixed-tip');
  copyDir(sourceDir, fixedTipDir);
  let pinnedHeight = null;
  const fixedTipReplay = await runReplay({
    dataDir: fixedTipDir,
    config: cfg,
    progressEvery: 0,
    afterSnapshot: ({ targetHeight }) => {
      pinnedHeight = targetHeight;
      const laterStorage = new SqliteStorage(fixedTipDir, cfg);
      try {
        const laterChain = createBlockchain(cfg, createMempool(cfg), laterStorage, fixedTipDir);
        laterChain.mineNextBlock();
      } finally {
        laterStorage.close();
      }
    }
  });
  assert.strictEqual(fixedTipReplay.toHeight, pinnedHeight, 'replay reports pinned target height');
  assert.strictEqual(fixedTipReplay.toHeight, Number(originalState.latestHeight), 'blocks added after snapshot do not change replay target');

  const genesisOnlyDir = path.join(root, 'genesis-only');
  const genesisStorage = new SqliteStorage(genesisOnlyDir, cfg);
  createBlockchain(cfg, createMempool(cfg), genesisStorage, genesisOnlyDir);
  genesisStorage.close();
  const genesisReplay = await runReplay({ dataDir: genesisOnlyDir, config: cfg, progressEvery: 0 });
  assert.strictEqual(genesisReplay.success, true, 'genesis-only chain replays');
  assert.strictEqual(genesisReplay.blocksVerified, 1, 'genesis-only replay verifies one block');

  const prevHashDir = path.join(root, 'bad-prevhash');
  copyDir(sourceDir, prevHashDir);
  mutateBlock(prevHashDir, 2, (block) => {
    block.prevHash = '1'.repeat(64);
    const header = JSON.parse(block.header);
    header.prevHash = block.prevHash;
    block.header = JSON.stringify(header);
    block.hash = sha256(block.header);
  });
  await expectReplayFailure(prevHashDir, cfg, 'REPLAY_PREVIOUS_HASH_MISMATCH', 2);

  const blockHashDir = path.join(root, 'bad-blockhash');
  copyDir(sourceDir, blockHashDir);
  mutateBlock(blockHashDir, 1, (block) => { block.hash = '2'.repeat(64); });
  await expectReplayFailure(blockHashDir, cfg, 'REPLAY_BLOCK_HASH_MISMATCH', 1);

  const txDir = path.join(root, 'bad-transaction');
  copyDir(sourceDir, txDir);
  mutateBlock(txDir, 1, (block) => {
    const tx = (block.transactions || []).find((item) => item.type === 'treasury_reward') || block.transactions[0];
    tx.amountMicro = (BigInt(tx.amountMicro || '0') + 1n).toString();
  });
  await expectReplayFailure(txDir, cfg, 'REPLAY_REWARD_MISMATCH', 1);

  const duplicateDir = path.join(root, 'duplicate-tx');
  copyDir(sourceDir, duplicateDir);
  mutateBlock(duplicateDir, 1, (block) => {
    block.transactions.push({ ...block.transactions[0] });
    block.txCount = block.transactions.length;
  });
  await expectReplayFailure(duplicateDir, cfg, 'REPLAY_TXID_MISMATCH', 1);

  const rewardDir = path.join(root, 'bad-reward');
  copyDir(sourceDir, rewardDir);
  mutateBlock(rewardDir, 2, (block) => {
    block.mintUnits = (BigInt(block.mintUnits || '0') + 1n).toString();
  });
  await expectReplayFailure(rewardDir, cfg, 'REPLAY_REWARD_MISMATCH', 2);

  const rootDir = path.join(root, 'bad-stateroot');
  copyDir(sourceDir, rootDir);
  mutateBlock(rootDir, 1, (block) => { block.stateRoot = '3'.repeat(64); });
  await expectReplayFailure(rootDir, cfg, 'REPLAY_STATE_ROOT_MISMATCH', 1);

  const tipStateDir = path.join(root, 'bad-tip-state');
  copyDir(sourceDir, tipStateDir);
  const db = openDb(tipStateDir);
  try {
    const row = db.prepare('SELECT addr, balanceMicro FROM state_balances ORDER BY addr LIMIT 1').get();
    assert.ok(row, 'balance row exists');
    db.prepare('UPDATE state_balances SET balanceMicro = ? WHERE addr = ?').run((BigInt(row.balanceMicro) + 1n).toString(), row.addr);
  } finally {
    db.close();
  }
  await expectReplayFailure(tipStateDir, cfg, 'REPLAY_TIP_STATE_MISMATCH', 4);

  const versionDir = path.join(root, 'bad-version');
  copyDir(sourceDir, versionDir);
  mutateBlock(versionDir, 1, (block) => { block.protocolVersion = '9.9.9'; });
  await expectReplayFailure(versionDir, cfg, 'REPLAY_UNSUPPORTED_VERSION', 1);

  const cfgPath = path.join(root, 'config.yml');
  writeConfig(cfgPath, cfg);
  const backupDir = path.join(root, 'backups');
  const restoreDir = path.join(root, 'restore');
  const created = await createBackup({ dataDir: sourceDir, configPath: cfgPath, outDir: backupDir });
  assert.strictEqual(verifyBackupArchive(created.zipPath).ok, true, 'backup verifies before replay integration');
  restoreBackup({ zipPath: created.zipPath, targetDir: restoreDir });
  const restoredReplay = await runReplay({ dataDir: restoreDir, config: cfg, progressEvery: 0 });
  assert.strictEqual(restoredReplay.success, true, 'restored backup replays successfully');
  assert.strictEqual(restoredReplay.replayedTipHash, originalState.latestHash, 'restored backup replay tip matches original');

  console.log('replay tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
