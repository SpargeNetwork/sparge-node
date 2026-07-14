const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createBlockchain } = require('./blockchain');
const { createMempool } = require('./mempool');
const { calculateStateRoot } = require('./invariants');
const { ReadOnlyChainReader, normalizeLedger } = require('./replay');
const { SqliteStorage } = require('../storage/sqliteStorage');

function digestCoreLedger(ledger) {
  const normalized = normalizeLedger(ledger);
  delete normalized.balanceHistory;
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function rebuildBalanceHistory({ dataDir, config, apply = false }) {
  const resolvedDataDir = path.resolve(dataDir);
  const reader = new ReadOnlyChainReader(resolvedDataDir);
  let tempDir;
  let tempStorage;
  try {
    reader.integrityCheck();
    const snapshot = reader.readPinnedSnapshot({ fromHeight: 0 });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparge-history-repair-'));
    fs.copyFileSync(path.join(resolvedDataDir, 'genesis.json'), path.join(tempDir, 'genesis.json'));

    const replayConfig = JSON.parse(JSON.stringify(config));
    replayConfig.invariants = {
      ...(replayConfig.invariants || {}),
      enabled: false,
      fullAuditOnStartup: false,
      fastChecksEveryBlock: false
    };
    tempStorage = new SqliteStorage(tempDir, replayConfig);
    const replayChain = createBlockchain(replayConfig, createMempool(replayConfig), tempStorage, tempDir);

    for (let index = 0; index < snapshot.blocks.length; index += 1) {
      const block = snapshot.blocks[index];
      if (index === 0) {
        const genesis = replayChain.getBlockByHeight(0);
        if (genesis.hash !== block.hash || genesis.stateRoot !== block.stateRoot) {
          throw new Error('Replayed genesis does not match the stored chain.');
        }
        continue;
      }
      const result = replayChain.applyExternalBlock(block);
      if (!result.ok) {
        throw new Error(`Replay failed at block ${block.height}: ${result.code || result.error || 'unknown error'}`);
      }
    }

    const replayLedger = tempStorage.loadLedger();
    const replayTip = tempStorage.getLatestBlock();
    if (replayTip.hash !== snapshot.target.hash || replayTip.stateRoot !== snapshot.target.stateRoot) {
      throw new Error('Replayed tip does not match the stored chain.');
    }
    if (calculateStateRoot(replayLedger) !== snapshot.target.stateRoot) {
      throw new Error('Replayed state root does not match the stored chain.');
    }
    if (digestCoreLedger(replayLedger) !== digestCoreLedger(snapshot.ledger)) {
      throw new Error('Replayed balances, nonces, stakes, or participants do not match persisted state.');
    }

    const entries = Object.entries(replayLedger.balanceHistory || {}).flatMap(([address, history]) =>
      history.map((entry) => ({
        address,
        height: Number(entry.height),
        balanceMicro: String(entry.balanceMicro ?? entry.balance)
      }))
    );
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.height) || entry.height < 0 || !/^(0|[1-9][0-9]*)$/.test(entry.balanceMicro)) {
        throw new Error('Replay produced invalid balance history.');
      }
    }

    if (apply) {
      const dbPath = path.join(resolvedDataDir, 'state.db');
      const db = new Database(dbPath);
      try {
        const insert = db.prepare('INSERT INTO balance_history(addr, height, balanceMicro) VALUES(?, ?, ?)');
        db.transaction(() => {
          db.prepare('DELETE FROM balance_history').run();
          for (const entry of entries) insert.run(entry.address, entry.height, entry.balanceMicro);
        })();
        if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
          throw new Error('SQLite integrity check failed after balance history repair.');
        }
      } finally {
        db.close();
      }
    }

    return {
      applied: apply,
      height: snapshot.target.height,
      latestHash: snapshot.target.hash,
      addresses: Object.keys(replayLedger.balanceHistory || {}).length,
      entries: entries.length
    };
  } finally {
    if (tempStorage) tempStorage.close();
    reader.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { rebuildBalanceHistory };
