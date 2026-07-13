const assert = require('assert');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { createBlockchain } = require('../server/lib/blockchain');
const { createMempool } = require('../server/lib/mempool');
const { SqliteStorage } = require('../server/storage/sqliteStorage');
const {
  createBackup,
  restoreBackup,
  verifyBackupArchive,
  verifyRestoredData
} = require('../server/lib/backup');
const { readZip, writeZip } = require('../server/lib/zipArchive');

const ADDRESS_A = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';

function config() {
  return {
    chain: {
      name: 'Sparge Backup Test',
      symbol: 'SPG',
      chainId: 'sparge-backup-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0',
      blockTimeSeconds: 2,
      genesisCreatedAt: '2026-01-01T00:00:00.000Z'
    },
    token: { decimals: 6, initialSupplyTokens: '1000' },
    mining: { proposerAddress: ADDRESS_A, genesisOperatorAddress: ADDRESS_A, genesisFreeBlocks: 10 },
    rewards: { treasuryAddress: ADDRESS_A, nodePoolAddress: 'NODE_POOL', holderPoolAddress: 'HOLDER_POOL' },
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

function writeConfig(filePath, cfg) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(cfg), 'utf8');
}

(async () => {
  const root = path.join(__dirname, 'out', 'test-backup');
  clean(root);
  const sourceDir = path.join(root, 'source');
  const backupDir = path.join(root, 'backups');
  const restoreDir = path.join(root, 'restore');
  const cfgPath = path.join(root, 'config.yml');
  const cfg = config();
  writeConfig(cfgPath, cfg);

  const storage = new SqliteStorage(sourceDir, cfg);
  const mempool = createMempool(cfg);
  const chain = createBlockchain(cfg, mempool, storage, sourceDir);
  const mined = chain.mineNextBlock();
  assert.ok(mined && mined.height === 1, 'fixture chain mines one block');
  const original = chain.getState();

  const created = await createBackup({ dataDir: sourceDir, configPath: cfgPath, outDir: backupDir });
  assert.ok(fs.existsSync(created.zipPath), 'backup zip is created');
  assert.strictEqual(created.metadata.backupVersion, 1, 'backup version is set');
  assert.strictEqual(created.metadata.chainId, cfg.chain.chainId, 'metadata chainId matches');
  assert.strictEqual(created.metadata.blockHeight, Number(original.latestHeight), 'metadata height matches');
  assert.strictEqual(created.metadata.latestBlockHash, original.latestHash, 'metadata latest hash matches');
  assert.ok(created.metadata.stateRoot, 'metadata state root exists');
  assert.ok(created.metadata.files.some((file) => file.path === 'data/state.db'), 'metadata includes state.db');
  assert.ok(created.metadata.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)), 'every metadata file has sha256');
  assert.ok(fs.existsSync(path.join(sourceDir, 'backup-status.json')), 'backup status marker is written');

  const verified = verifyBackupArchive(created.zipPath);
  assert.strictEqual(verified.ok, true, `backup verifies: ${verified.errors.join('; ')}`);

  const restored = restoreBackup({ zipPath: created.zipPath, targetDir: restoreDir });
  assert.strictEqual(restored.metadata.latestBlockHash, original.latestHash, 'restore metadata hash matches original');
  assert.ok(fs.existsSync(path.join(restoreDir, 'state.db')), 'restore writes state.db');
  assert.ok(fs.existsSync(path.join(restoreDir, 'genesis.json')), 'restore writes genesis.json');
  assert.ok(fs.existsSync(path.join(restoreDir, 'backup-config.yml')), 'restore keeps recovery config copy');

  const restoredAudit = verifyRestoredData(restoreDir, cfg);
  assert.strictEqual(restoredAudit.ok, true, `restored startup audit passes: ${restoredAudit.audit.errors.join('; ')}`);
  assert.strictEqual(restoredAudit.latest.hash, original.latestHash, 'restored latest hash equals original');
  assert.strictEqual(Number(restoredAudit.latest.height), Number(original.latestHeight), 'restored height equals original');
  assert.strictEqual(restoredAudit.latest.stateRoot, created.metadata.stateRoot, 'restored state root equals backup metadata');

  assert.throws(() => restoreBackup({ zipPath: created.zipPath, targetDir: restoreDir }), /not empty/, 'restore refuses existing target without force');

  const truncated = path.join(backupDir, 'truncated.zip');
  const bytes = fs.readFileSync(created.zipPath);
  fs.writeFileSync(truncated, bytes.slice(0, Math.max(1, bytes.length - 20)));
  assert.strictEqual(verifyBackupArchive(truncated).ok, false, 'truncated backup is rejected');

  const checksumBad = path.join(backupDir, 'checksum-bad.zip');
  const entries = readZip(created.zipPath);
  const meta = JSON.parse(entries.get('backup.json').toString('utf8'));
  meta.files.find((file) => file.path === 'data/state.db').sha256 = '0'.repeat(64);
  entries.set('backup.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf8'));
  writeZip(checksumBad, Array.from(entries.entries()).map(([name, data]) => ({ name, data })));
  assert.strictEqual(verifyBackupArchive(checksumBad).ok, false, 'modified checksum is rejected');

  const wrongGenesis = path.join(backupDir, 'wrong-genesis.zip');
  const entries2 = readZip(created.zipPath);
  const genesis = JSON.parse(entries2.get('data/genesis.json').toString('utf8'));
  genesis.genesisHash = 'f'.repeat(64);
  entries2.set('data/genesis.json', Buffer.from(JSON.stringify(genesis, null, 2), 'utf8'));
  writeZip(wrongGenesis, Array.from(entries2.entries()).map(([name, data]) => ({ name, data })));
  assert.strictEqual(verifyBackupArchive(wrongGenesis).ok, false, 'wrong genesis is rejected');

  storage.close();
  console.log('backup tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
