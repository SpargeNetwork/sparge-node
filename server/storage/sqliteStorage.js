const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

class SqliteStorage {
  constructor(dataDir, config) {
    ensureDir(dataDir);
    this.dbPath = path.join(dataDir, 'state.db');
    this.config = config;
    const nativeBinding = process.env.BETTER_SQLITE3_BINDING || null;
    this.db = nativeBinding ? new Database(this.dbPath, { nativeBinding }) : new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        hash TEXT NOT NULL,
        prevHash TEXT,
        prevStateRoot TEXT,
        stateRoot TEXT NOT NULL,
        proposer TEXT,
        timestamp INTEGER,
        blockJson TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tx_index (
        txid TEXT PRIMARY KEY,
        height INTEGER NOT NULL,
        txIndex INTEGER NOT NULL,
        timestamp INTEGER,
        type TEXT,
        fromAddr TEXT,
        toAddr TEXT,
        participantAddr TEXT,
        sponsorAddr TEXT,
        amountMicro TEXT,
        feeMicro TEXT,
        memo TEXT
      );

      CREATE TABLE IF NOT EXISTS address_txs (
        addr TEXT NOT NULL,
        txid TEXT NOT NULL,
        height INTEGER NOT NULL,
        timestamp INTEGER,
        direction INTEGER,
        PRIMARY KEY (addr, txid)
      );

      CREATE INDEX IF NOT EXISTS idx_address_txs_addr_height ON address_txs(addr, height DESC);
      CREATE INDEX IF NOT EXISTS idx_tx_index_height ON tx_index(height);

      CREATE TABLE IF NOT EXISTS state_balances (
        addr TEXT PRIMARY KEY,
        balanceMicro TEXT NOT NULL,
        nonce INTEGER NOT NULL,
        firstSeenHeight INTEGER,
        updatedHeight INTEGER
      );

      CREATE TABLE IF NOT EXISTS state_stakes (
        addr TEXT PRIMARY KEY,
        stakeMicro TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS participants (
        addr TEXT PRIMARY KEY,
        sponsorAddr TEXT,
        bondLockedMicro TEXT NOT NULL,
        registeredHeight INTEGER,
        lastSeenHeight INTEGER,
        isActive INTEGER
      );

      CREATE TABLE IF NOT EXISTS balance_history (
        addr TEXT NOT NULL,
        height INTEGER NOT NULL,
        balanceMicro TEXT NOT NULL,
        PRIMARY KEY (addr, height)
      );

      CREATE TABLE IF NOT EXISTS observer_nodes (
        nodeId TEXT PRIMARY KEY,
        nodeName TEXT,
        remoteIp TEXT,
        country TEXT,
        publicListingEnabled INTEGER NOT NULL DEFAULT 0,
        publicAlias TEXT,
        countryCode TEXT,
        version TEXT,
        height INTEGER NOT NULL,
        latestHash TEXT,
        firstSeen INTEGER NOT NULL,
        lastSeen INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_observer_nodes_last_seen ON observer_nodes(lastSeen DESC);
      CREATE INDEX IF NOT EXISTS idx_observer_nodes_country ON observer_nodes(country);
      CREATE INDEX IF NOT EXISTS idx_observer_nodes_version ON observer_nodes(version);
    `);
    this._ensureObserverColumn('publicListingEnabled', 'INTEGER NOT NULL DEFAULT 0');
    this._ensureObserverColumn('publicAlias', 'TEXT');
    this._ensureObserverColumn('countryCode', 'TEXT');
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_observer_nodes_country_code ON observer_nodes(countryCode);
      CREATE INDEX IF NOT EXISTS idx_observer_nodes_public_listing ON observer_nodes(publicListingEnabled);
    `);
    this.db.prepare('UPDATE observer_nodes SET publicListingEnabled = 0, publicAlias = NULL, countryCode = NULL, nodeName = NULL, country = NULL WHERE publicListingEnabled IS NULL OR nodeName IS NOT NULL').run();
  }

  _ensureObserverColumn(name, definition) {
    const cols = this.db.prepare('PRAGMA table_info(observer_nodes)').all();
    if (cols.some((col) => col.name === name)) return;
    this.db.exec(`ALTER TABLE observer_nodes ADD COLUMN ${name} ${definition}`);
  }

  _getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  _setMeta(key, value) {
    this.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
  }

  initializeMeta({ chainId, genesisHash, protocolVersion, economicsVersion }) {
    const schemaVersion = this._getMeta('schema_version');
    if (!schemaVersion) {
      this._setMeta('schema_version', '1');
      this._setMeta('chainId', chainId);
      this._setMeta('genesisHash', genesisHash);
      this._setMeta('protocolVersion', protocolVersion);
      this._setMeta('economicsVersion', economicsVersion);
      return;
    }

    const storedChainId = this._getMeta('chainId');
    const storedGenesis = this._getMeta('genesisHash');
    const storedProtocol = this._getMeta('protocolVersion');
    const storedEconomics = this._getMeta('economicsVersion');
    if (storedChainId !== chainId || storedGenesis !== genesisHash || storedProtocol !== protocolVersion || storedEconomics !== economicsVersion) {
      throw new Error('SQLite storage meta mismatch (chainId/genesisHash/protocol/economics)');
    }
  }

  loadMeta() {
    const rows = this.db.prepare('SELECT key, value FROM meta').all();
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  saveMeta(meta) {
    const stmt = this.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const trx = this.db.transaction(() => {
      Object.entries(meta).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        stmt.run(key, String(value));
      });
    });
    trx();
  }

  loadLedger() {
    const ledger = {
      balances: {},
      nonces: {},
      stakes: {},
      participants: {},
      balanceHistory: {}
    };

    const balances = this.db.prepare('SELECT addr, balanceMicro, nonce FROM state_balances').all();
    balances.forEach((row) => {
      ledger.balances[row.addr] = row.balanceMicro;
      ledger.nonces[row.addr] = row.nonce.toString();
    });

    const stakes = this.db.prepare('SELECT addr, stakeMicro FROM state_stakes').all();
    stakes.forEach((row) => {
      ledger.stakes[row.addr] = row.stakeMicro;
    });

    const participants = this.db.prepare('SELECT addr, sponsorAddr, bondLockedMicro, registeredHeight, lastSeenHeight FROM participants').all();
    participants.forEach((row) => {
      ledger.participants[row.addr] = {
        sponsor: row.sponsorAddr || '',
        bondMicro: row.bondLockedMicro || '0',
        registeredHeight: row.registeredHeight?.toString() ?? '0',
        lastSeenHeight: row.lastSeenHeight?.toString() ?? '0'
      };
    });

    const historyRows = this.db.prepare('SELECT addr, height, balanceMicro FROM balance_history ORDER BY height ASC').all();
    historyRows.forEach((row) => {
      if (!ledger.balanceHistory[row.addr]) ledger.balanceHistory[row.addr] = [];
      ledger.balanceHistory[row.addr].push({
        height: row.height,
        balance: row.balanceMicro
      });
    });

    return ledger;
  }

  saveLedger(ledger) {
    const insertBalance = this.db.prepare('INSERT INTO state_balances(addr, balanceMicro, nonce, firstSeenHeight, updatedHeight) VALUES(?, ?, ?, ?, ?)');
    const insertStake = this.db.prepare('INSERT INTO state_stakes(addr, stakeMicro) VALUES(?, ?)');
    const insertParticipant = this.db.prepare('INSERT INTO participants(addr, sponsorAddr, bondLockedMicro, registeredHeight, lastSeenHeight, isActive) VALUES(?, ?, ?, ?, ?, ?)');
    const insertHistory = this.db.prepare('INSERT INTO balance_history(addr, height, balanceMicro) VALUES(?, ?, ?)');

    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM state_balances').run();
      this.db.prepare('DELETE FROM state_stakes').run();
      this.db.prepare('DELETE FROM participants').run();
      this.db.prepare('DELETE FROM balance_history').run();

      Object.entries(ledger.balances || {}).forEach(([addr, balance]) => {
        const nonce = ledger.nonces?.[addr] ?? '0';
        insertBalance.run(addr, String(balance), Number(nonce), null, null);
      });

      Object.entries(ledger.stakes || {}).forEach(([addr, stake]) => {
        insertStake.run(addr, String(stake));
      });

      Object.entries(ledger.participants || {}).forEach(([addr, record]) => {
        insertParticipant.run(
          addr,
          record.sponsor || '',
          String(record.bondMicro || '0'),
          Number(record.registeredHeight || 0),
          Number(record.lastSeenHeight || 0),
          null
        );
      });

      Object.entries(ledger.balanceHistory || {}).forEach(([addr, history]) => {
        history.forEach((entry) => {
          insertHistory.run(addr, Number(entry.height), String(entry.balance));
        });
      });
    });
    trx();
  }

  getLatestBlock() {
    const row = this.db.prepare('SELECT blockJson FROM blocks ORDER BY height DESC LIMIT 1').get();
    if (!row) return null;
    return JSON.parse(row.blockJson);
  }

  getBlocksPage(offset, limit) {
    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get();
    const total = totalRow ? totalRow.count : 0;
    const rows = this.db.prepare('SELECT blockJson FROM blocks ORDER BY height DESC LIMIT ? OFFSET ?')
      .all(limit, offset);
    const blocks = rows.map((row) => JSON.parse(row.blockJson));
    return { total, blocks };
  }

  getBlocksFromHeight(startHeight, limit) {
    const rows = this.db.prepare('SELECT blockJson FROM blocks WHERE height >= ? ORDER BY height ASC LIMIT ?')
      .all(startHeight, limit);
    return rows.map((row) => JSON.parse(row.blockJson));
  }

  getAllBlocks() {
    const rows = this.db.prepare('SELECT blockJson FROM blocks ORDER BY height ASC').all();
    return rows.map((row) => JSON.parse(row.blockJson));
  }

  getBlockByHeight(height) {
    const row = this.db.prepare('SELECT blockJson FROM blocks WHERE height = ?').get(height);
    if (!row) return null;
    return JSON.parse(row.blockJson);
  }

  getTxById(txid) {
    const row = this.db.prepare('SELECT height, txIndex FROM tx_index WHERE txid = ?').get(txid);
    if (!row) return null;
    const blockRow = this.db.prepare('SELECT blockJson FROM blocks WHERE height = ?').get(row.height);
    if (!blockRow) return null;
    const block = JSON.parse(blockRow.blockJson);
    const tx = (block.transactions || [])[row.txIndex];
    if (!tx) return null;
    return { ...tx, blockHeight: block.height };
  }

  getAddressSummary(address, activeWindowBlocks) {
    const balanceRow = this.db.prepare('SELECT balanceMicro, nonce FROM state_balances WHERE addr = ?').get(address);
    const balance = balanceRow?.balanceMicro ?? '0';
    const nonce = balanceRow?.nonce?.toString() ?? '0';

    const statsRow = this.db.prepare('SELECT COUNT(*) as count, MIN(height) as firstHeight, MAX(height) as lastHeight, MIN(timestamp) as firstTime, MAX(timestamp) as lastTime FROM address_txs WHERE addr = ?').get(address);
    const txCount = statsRow?.count ?? 0;
    const firstSeenHeight = statsRow?.firstHeight ?? null;
    const lastSeenHeight = statsRow?.lastHeight ?? null;
    const firstSeen = statsRow?.firstTime ? new Date(statsRow.firstTime).toISOString() : null;
    const lastSeen = statsRow?.lastTime ? new Date(statsRow.lastTime).toISOString() : null;

    const participant = this.db.prepare('SELECT sponsorAddr, bondLockedMicro, registeredHeight, lastSeenHeight FROM participants WHERE addr = ?').get(address);
    let participantRecord = null;
    if (participant) {
      const lastSeenVal = Number(participant.lastSeenHeight ?? 0);
      const heightRow = this.db.prepare('SELECT MAX(height) as height FROM blocks').get();
      const latestHeight = heightRow?.height ?? 0;
      const isActive = latestHeight >= lastSeenVal && (latestHeight - lastSeenVal) <= Number(activeWindowBlocks);
      participantRecord = {
        sponsor: participant.sponsorAddr || '',
        bondMicro: participant.bondLockedMicro || '0',
        registeredHeight: participant.registeredHeight?.toString() ?? '0',
        lastSeenHeight: participant.lastSeenHeight?.toString() ?? '0',
        status: isActive ? 'active' : 'inactive'
      };
    }

    const sponsoredActiveCount = this.db.prepare('SELECT COUNT(*) as count FROM participants WHERE sponsorAddr = ?').get(address)?.count ?? 0;

    return {
      address,
      balanceMicro: balance,
      nonce,
      txCount,
      firstSeenHeight,
      lastSeenHeight,
      firstSeen,
      lastSeen,
      participant: participantRecord,
      sponsoredActiveCount
    };
  }

  getAddressTxs(address, limit = 50) {
    const rows = this.db.prepare(`
      SELECT a.txid, a.height, a.timestamp, t.type, t.fromAddr, t.toAddr, t.amountMicro, t.feeMicro
      FROM address_txs a
      JOIN tx_index t ON t.txid = a.txid
      WHERE a.addr = ?
      ORDER BY a.height DESC
      LIMIT ?
    `).all(address, limit);

    return rows.map((row) => ({
      txid: row.txid,
      from: row.fromAddr || null,
      to: row.toAddr || null,
      amountMicro: row.amountMicro || '0',
      feeMicro: row.feeMicro || '0',
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
      blockHeight: row.height,
      type: row.type || 'transfer'
    }));
  }

  checkIntegrity() {
    try {
      const result = this.db.pragma('integrity_check');
      const ok = Array.isArray(result)
        && result.length === 1
        && String(result[0].integrity_check || '').toLowerCase() === 'ok';
      return { ok };
    } catch {
      return { ok: false };
    }
  }

  putBlock(block, meta, ledger) {
    const insertBlock = this.db.prepare(`
      INSERT INTO blocks(height, hash, prevHash, prevStateRoot, stateRoot, proposer, timestamp, blockJson)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTx = this.db.prepare(`
      INSERT INTO tx_index(txid, height, txIndex, timestamp, type, fromAddr, toAddr, participantAddr, sponsorAddr, amountMicro, feeMicro, memo)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAddressTx = this.db.prepare(`
      INSERT INTO address_txs(addr, txid, height, timestamp, direction)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(addr, txid) DO NOTHING
    `);

    const trx = this.db.transaction(() => {
      insertBlock.run(
        block.height,
        block.hash,
        block.prevHash,
        block.prevStateRoot,
        block.stateRoot,
        block.rewardTo || null,
        toTimestamp(block.timestamp),
        JSON.stringify(block)
      );

      const txs = Array.isArray(block.transactions) ? block.transactions : [];
      txs.forEach((tx, idx) => {
        const txid = tx.txid ?? tx.id;
        const ts = toTimestamp(tx.timestamp || block.timestamp);
        insertTx.run(
          txid,
          block.height,
          idx,
          ts,
          tx.type || 'transfer',
          tx.from || null,
          tx.to || null,
          tx.participant || null,
          tx.sponsor || null,
          tx.amountMicro ?? tx.amountBaseUnits ?? '0',
          tx.feeMicro ?? tx.feeBaseUnits ?? '0',
          tx.memo || null
        );

        if (tx.from) insertAddressTx.run(tx.from, txid, block.height, ts, -1);
        if (tx.to) insertAddressTx.run(tx.to, txid, block.height, ts, 1);
      });

      this.saveMeta(meta);
      this.saveLedger(ledger);
    });

    trx();
  }

  upsertObserverNode(observer) {
    const now = observer.lastSeen || Date.now();
    this.db.prepare(`
      INSERT INTO observer_nodes(nodeId, nodeName, remoteIp, country, publicListingEnabled, publicAlias, countryCode, version, height, latestHash, firstSeen, lastSeen)
      VALUES(@nodeId, NULL, @remoteIp, NULL, @publicListingEnabled, @publicAlias, @countryCode, @version, @height, @latestHash, @firstSeen, @lastSeen)
      ON CONFLICT(nodeId) DO UPDATE SET
        remoteIp = excluded.remoteIp,
        nodeName = NULL,
        country = NULL,
        publicListingEnabled = excluded.publicListingEnabled,
        publicAlias = excluded.publicAlias,
        countryCode = excluded.countryCode,
        version = excluded.version,
        height = excluded.height,
        latestHash = excluded.latestHash,
        lastSeen = excluded.lastSeen
    `).run({
      nodeId: observer.nodeId,
      remoteIp: observer.remoteIp || '',
      publicListingEnabled: observer.publicListingEnabled ? 1 : 0,
      publicAlias: observer.publicListingEnabled && observer.publicAlias ? observer.publicAlias : null,
      countryCode: observer.publicListingEnabled && observer.countryCode ? observer.countryCode : null,
      version: observer.version || '',
      height: Number(observer.height || 0),
      latestHash: observer.latestHash || '',
      firstSeen: observer.firstSeen || now,
      lastSeen: now
    });
  }

  listObserverNodes({ limit = 50, offset = 0, countryCode = '', version = '', publicOnly = false } = {}) {
    const where = [];
    const params = {};
    if (publicOnly) {
      where.push('publicListingEnabled = 1');
    }
    if (countryCode) {
      where.push('countryCode = @countryCode');
      params.countryCode = countryCode;
    }
    if (version) {
      where.push('version = @version');
      params.version = version;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM observer_nodes ${whereSql}`).get(params)?.count ?? 0;
    const rows = this.db.prepare(`
      SELECT nodeId, nodeName, remoteIp, country, publicListingEnabled, publicAlias, countryCode, version, height, latestHash, firstSeen, lastSeen
      FROM observer_nodes
      ${whereSql}
      ORDER BY lastSeen DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: Number(limit), offset: Number(offset) });
    return { total, observers: rows };
  }

  getAllObserverNodes() {
    return this.db.prepare(`
      SELECT nodeId, nodeName, remoteIp, country, publicListingEnabled, publicAlias, countryCode, version, height, latestHash, firstSeen, lastSeen
      FROM observer_nodes
      ORDER BY lastSeen DESC
    `).all();
  }

  deleteObserverNodesLastSeenBefore(cutoffMs) {
    return this.db.prepare('DELETE FROM observer_nodes WHERE lastSeen < ?').run(Number(cutoffMs)).changes;
  }

  close() {
    this.db.close();
  }
}

module.exports = { SqliteStorage };
