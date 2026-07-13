const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const YAML = require('yaml');
const { writeZip, readZip } = require('./zipArchive');
const { computeGenesisHash } = require('./genesis');
const { SqliteStorage } = require('../storage/sqliteStorage');
const { runFullInvariantAudit } = require('./invariants');

const BACKUP_VERSION = 1;
const REQUIRED_ENTRIES = ['data/state.db', 'data/genesis.json', 'config/config.yml', 'backup.json'];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestInfo(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const metaRows = db.prepare('SELECT key, value FROM meta').all();
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
    const latest = db.prepare('SELECT height, hash, stateRoot, blockJson FROM blocks ORDER BY height DESC LIMIT 1').get();
    const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
    const integrity = db.pragma('quick_check', { simple: true });
    if (integrity !== 'ok') throw new Error('SQLite quick_check failed');
    return {
      meta,
      latest,
      sqliteVersion
    };
  } finally {
    db.close();
  }
}

async function createSqliteSnapshot(sourceDb, destDb) {
  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destDb);
  } finally {
    source.close();
  }
}

function metadataFromFiles(files, info, genesis, config, softwareVersion) {
  const checksums = {};
  const fileList = files.map((file) => {
    checksums[file.name] = sha256(file.data);
    return {
      path: file.name,
      bytes: file.data.length,
      sha256: checksums[file.name]
    };
  });
  return {
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    softwareVersion,
    chainId: info.meta.chainId || config.chain?.chainId || genesis.chainId,
    protocolVersion: info.meta.protocolVersion || config.chain?.protocolVersion || genesis.protocolVersion,
    economicsVersion: info.meta.economicsVersion || config.chain?.economicsVersion || genesis.economicsVersion,
    genesisHash: info.meta.genesisHash || genesis.genesisHash || computeGenesisHash({ ...genesis, genesisHash: undefined }),
    blockHeight: Number(info.latest?.height || 0),
    latestBlockHash: info.latest?.hash || info.meta.latestHash || '',
    stateRoot: info.latest?.stateRoot || '',
    sqliteVersion: info.sqliteVersion,
    files: fileList
  };
}

async function createBackup({ dataDir, configPath, outDir, logger = null }) {
  const stateDb = path.join(dataDir, 'state.db');
  const genesisPath = path.join(dataDir, 'genesis.json');
  if (!fs.existsSync(stateDb)) throw new Error(`Missing SQLite database: ${stateDb}`);
  if (!fs.existsSync(genesisPath)) throw new Error(`Missing genesis file: ${genesisPath}`);
  if (!fs.existsSync(configPath)) throw new Error(`Missing config file: ${configPath}`);
  ensureDir(outDir);
  logger?.info?.('backup_started', { operation: 'backup' }, 'Backup started');

  const tmpDir = path.join(outDir, `.backup-stage-${process.pid}-${Date.now()}`);
  ensureDir(tmpDir);
  const tmpDb = path.join(tmpDir, 'state.db');
  try {
    await createSqliteSnapshot(stateDb, tmpDb);
    const info = latestInfo(tmpDb);
    const genesis = readJson(genesisPath);
    const configRaw = fs.readFileSync(configPath);
    const config = YAML.parse(configRaw.toString('utf8')) || {};
    const softwareVersion = config.chain?.protocolVersion || '1.0.0';
    const payloadFiles = [
      { name: 'data/state.db', data: fs.readFileSync(tmpDb) },
      { name: 'data/genesis.json', data: fs.readFileSync(genesisPath) },
      { name: 'config/config.yml', data: configRaw }
    ];
    const metadata = metadataFromFiles(payloadFiles, info, genesis, config, softwareVersion);
    const backupJson = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
    const allFiles = [...payloadFiles, { name: 'backup.json', data: backupJson }];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const zipPath = path.join(outDir, `sparge-backup-${metadata.chainId}-${metadata.blockHeight}-${stamp}.zip`);
    writeZip(zipPath, allFiles);
    const verification = verifyBackupArchive(zipPath);
    if (!verification.ok) throw new Error(`Backup verification failed: ${verification.errors.join('; ')}`);
    const status = {
      lastBackupAt: metadata.createdAt,
      lastBackupHeight: metadata.blockHeight,
      latestBlockHash: metadata.latestBlockHash,
      stateRoot: metadata.stateRoot
    };
    fs.writeFileSync(path.join(dataDir, 'backup-status.json'), JSON.stringify(status, null, 2), 'utf8');
    logger?.info?.('backup_completed', {
      operation: 'backup',
      blockHeight: metadata.blockHeight,
      latestBlockHashPrefix: metadata.latestBlockHash.slice(0, 12)
    }, 'Backup completed');
    return { zipPath, metadata };
  } catch (err) {
    logger?.error?.('backup_failed', { operation: 'backup', error: err }, 'Backup failed');
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function verifyBackupArchive(zipPath) {
  const errors = [];
  let entries;
  try {
    entries = readZip(zipPath);
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
  for (const required of REQUIRED_ENTRIES) {
    if (!entries.has(required)) errors.push(`Missing ${required}`);
  }
  if (errors.length) return { ok: false, errors };
  let metadata;
  try {
    metadata = JSON.parse(entries.get('backup.json').toString('utf8'));
  } catch {
    return { ok: false, errors: ['backup.json is invalid JSON'] };
  }
  if (metadata.backupVersion !== BACKUP_VERSION) errors.push('Unsupported backupVersion');
  if (!metadata.chainId || !metadata.genesisHash || !metadata.latestBlockHash || !metadata.stateRoot) {
    errors.push('backup metadata is incomplete');
  }
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  for (const file of files) {
    const data = entries.get(file.path);
    if (!data) {
      errors.push(`Missing ${file.path}`);
      continue;
    }
    if (data.length !== file.bytes) errors.push(`Size mismatch for ${file.path}`);
    if (sha256(data) !== file.sha256) errors.push(`Checksum mismatch for ${file.path}`);
  }
  try {
    const genesis = JSON.parse(entries.get('data/genesis.json').toString('utf8'));
    if ((genesis.genesisHash || '') !== metadata.genesisHash) errors.push('Genesis hash mismatch');
  } catch {
    errors.push('genesis.json is invalid JSON');
  }
  return { ok: errors.length === 0, errors, metadata, entries };
}

function verifyRestoredData(dataDir, config) {
  const storage = new SqliteStorage(dataDir, config);
  try {
    const genesis = JSON.parse(fs.readFileSync(path.join(dataDir, 'genesis.json'), 'utf8'));
    const genesisHash = genesis.genesisHash || computeGenesisHash(genesis);
    const meta = storage.loadMeta();
    const blocks = storage.getAllBlocks();
    const ledger = storage.loadLedger();
    const audit = runFullInvariantAudit({ blocks, ledger, meta, config, genesisHash, mempool: null, storage });
    const latest = blocks[blocks.length - 1] || null;
    return { ok: audit.ok, audit, latest, meta, genesisHash };
  } finally {
    storage.close();
  }
}

function targetHasData(targetDir) {
  if (!fs.existsSync(targetDir)) return false;
  return fs.readdirSync(targetDir).some((name) => !name.startsWith('.'));
}

function restoreBackup({ zipPath, targetDir, force = false, expectedChainId = '' }) {
  const verification = verifyBackupArchive(zipPath);
  if (!verification.ok) throw new Error(`Backup verification failed: ${verification.errors.join('; ')}`);
  const { metadata, entries } = verification;
  if (expectedChainId && metadata.chainId !== expectedChainId) throw new Error(`ChainId mismatch: backup=${metadata.chainId} expected=${expectedChainId}`);
  if (targetHasData(targetDir) && !force) throw new Error(`Target data directory is not empty: ${targetDir}`);

  const parent = path.dirname(targetDir);
  ensureDir(parent);
  const stage = path.join(parent, `.restore-stage-${process.pid}-${Date.now()}`);
  ensureDir(stage);
  try {
    fs.writeFileSync(path.join(stage, 'state.db'), entries.get('data/state.db'));
    fs.writeFileSync(path.join(stage, 'genesis.json'), entries.get('data/genesis.json'));
    fs.writeFileSync(path.join(stage, 'backup-config.yml'), entries.get('config/config.yml'));
    fs.writeFileSync(path.join(stage, 'backup.json'), entries.get('backup.json'));
    const config = YAML.parse(entries.get('config/config.yml').toString('utf8')) || {};
    const restored = verifyRestoredData(stage, config);
    if (!restored.ok) throw new Error(`Startup audit failed after restore: ${restored.audit.errors.join('; ')}`);
    if (metadata.genesisHash !== restored.genesisHash) throw new Error('Restored genesis hash mismatch');
    if (metadata.latestBlockHash !== restored.latest?.hash) throw new Error('Restored latest block hash mismatch');
    if (Number(metadata.blockHeight) !== Number(restored.latest?.height || 0)) throw new Error('Restored block height mismatch');
    if (metadata.stateRoot !== restored.latest?.stateRoot) throw new Error('Restored state root mismatch');
    if (fs.existsSync(targetDir)) {
      if (!force && targetHasData(targetDir)) throw new Error(`Target data directory is not empty: ${targetDir}`);
      if (force) fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.renameSync(stage, targetDir);
    return { metadata, targetDir };
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
}

function readBackupStatus(dataDir) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(dataDir, 'backup-status.json'), 'utf8'));
    const at = status.lastBackupAt || null;
    const ageSeconds = at ? Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000)) : null;
    return {
      lastBackupAt: at,
      lastBackupHeight: status.lastBackupHeight ?? null,
      backupAgeSeconds: Number.isFinite(ageSeconds) ? ageSeconds : null
    };
  } catch {
    return { lastBackupAt: null, lastBackupHeight: null, backupAgeSeconds: null };
  }
}

module.exports = {
  BACKUP_VERSION,
  createBackup,
  restoreBackup,
  verifyBackupArchive,
  verifyRestoredData,
  readBackupStatus,
  sha256
};
