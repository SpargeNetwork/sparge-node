const { appendBlock, loadBlocks, getLatestBlock, getBlocksPage, ensureDir } = require('../lib/storage');
const { loadLedger, saveLedger } = require('../lib/ledger');
const { loadMeta, saveMeta } = require('../lib/meta');

class JsonStorage {
  constructor(dataDir, config) {
    this.dataDir = dataDir;
    this.config = config;
    this.observerNodes = new Map();
    ensureDir(dataDir);
  }

  initializeMeta() {}

  loadMeta() {
    return loadMeta(this.dataDir) || {};
  }

  saveMeta(meta) {
    saveMeta(this.dataDir, meta);
  }

  loadLedger() {
    return loadLedger(this.dataDir);
  }

  saveLedger(ledger) {
    saveLedger(this.dataDir, ledger);
  }

  getLatestBlock() {
    return getLatestBlock(this.dataDir, this.config.storage.blocksPerFile);
  }

  getBlocksPage(offset, limit) {
    return getBlocksPage(this.dataDir, this.config.storage.blocksPerFile, offset, limit);
  }

  getBlocksFromHeight(startHeight, limit) {
    const all = loadBlocks(this.dataDir);
    const items = all.filter((block) => block.height >= startHeight);
    return items.slice(0, limit);
  }

  getAllBlocks() {
    return loadBlocks(this.dataDir);
  }

  getBlockByHeight(height) {
    const all = loadBlocks(this.dataDir);
    return all.find((block) => block.height === height) || null;
  }

  getTxById(txid) {
    const all = loadBlocks(this.dataDir);
    for (const block of all) {
      if (!Array.isArray(block.transactions)) continue;
      const found = block.transactions.find((tx) => tx.id === txid || tx.txid === txid);
      if (found) return { ...found, blockHeight: block.height };
    }
    return null;
  }

  getAddressSummary(address) {
    const all = loadBlocks(this.dataDir);
    const ledger = loadLedger(this.dataDir);
    let txCount = 0;
    let firstSeenHeight = null;
    let lastSeenHeight = null;
    let firstSeen = null;
    let lastSeen = null;
    for (const block of all) {
      const txs = Array.isArray(block.transactions) ? block.transactions : [];
      for (const tx of txs) {
        if (tx.from === address || tx.to === address) {
          txCount += 1;
          if (firstSeenHeight === null) {
            firstSeenHeight = block.height;
            firstSeen = block.timestamp || null;
          }
          lastSeenHeight = block.height;
          lastSeen = block.timestamp || null;
        }
      }
    }
    const balance = ledger.balances?.[address] ?? '0';
    const nonce = ledger.nonces?.[address] ?? '0';
    const participant = ledger.participants?.[address]
      ? {
          sponsor: ledger.participants[address].sponsor || '',
          bondMicro: ledger.participants[address].bondMicro || '0',
          registeredHeight: ledger.participants[address].registeredHeight || '0',
          lastSeenHeight: ledger.participants[address].lastSeenHeight || '0',
          status: 'inactive'
        }
      : null;
    const sponsoredActiveCount = Object.values(ledger.participants || {}).filter((record) => record.sponsor === address).length;
    return {
      address,
      balanceMicro: balance,
      nonce,
      txCount,
      firstSeenHeight,
      lastSeenHeight,
      firstSeen,
      lastSeen,
      participant,
      sponsoredActiveCount
    };
  }

  getAddressTxs(address, limit = 50) {
    const all = loadBlocks(this.dataDir);
    const items = [];
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const block = all[i];
      const txs = Array.isArray(block.transactions) ? block.transactions : [];
      for (const tx of txs) {
        if (tx.from !== address && tx.to !== address) continue;
        items.push({
          txid: tx.txid ?? tx.id,
          from: tx.from || null,
          to: tx.to || null,
          amountMicro: tx.amountMicro ?? tx.amountBaseUnits ?? '0',
          feeMicro: tx.feeMicro ?? tx.feeBaseUnits ?? '0',
          timestamp: tx.timestamp || block.timestamp,
          blockHeight: block.height,
          type: tx.type || 'transfer'
        });
        if (items.length >= limit) return items;
      }
    }
    return items;
  }

  putBlock(block, meta, ledger) {
    appendBlock(this.dataDir, this.config.storage.blocksPerFile, block);
    saveMeta(this.dataDir, meta);
    saveLedger(this.dataDir, ledger);
  }

  upsertObserverNode(observer) {
    const existing = this.observerNodes.get(observer.nodeId);
    const now = observer.lastSeen || Date.now();
    this.observerNodes.set(observer.nodeId, {
      ...(existing || {}),
      ...observer,
      nodeName: '',
      country: '',
      publicListingEnabled: observer.publicListingEnabled === true,
      publicAlias: observer.publicListingEnabled && observer.publicAlias ? observer.publicAlias : '',
      countryCode: observer.publicListingEnabled && observer.countryCode ? observer.countryCode : '',
      firstSeen: existing?.firstSeen || observer.firstSeen || now,
      lastSeen: now
    });
  }

  listObserverNodes({ limit = 50, offset = 0, countryCode = '', version = '', publicOnly = false } = {}) {
    let observers = Array.from(this.observerNodes.values());
    if (publicOnly) observers = observers.filter((node) => node.publicListingEnabled === true);
    if (countryCode) observers = observers.filter((node) => node.countryCode === countryCode);
    if (version) observers = observers.filter((node) => node.version === version);
    observers.sort((a, b) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
    return {
      total: observers.length,
      observers: observers.slice(offset, offset + limit)
    };
  }

  getAllObserverNodes() {
    return Array.from(this.observerNodes.values()).sort((a, b) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
  }

  deleteObserverNodesLastSeenBefore(cutoffMs) {
    let count = 0;
    for (const [nodeId, observer] of this.observerNodes.entries()) {
      if (Number(observer.lastSeen || 0) < cutoffMs) {
        this.observerNodes.delete(nodeId);
        count += 1;
      }
    }
    return count;
  }

  close() {}
}

module.exports = { JsonStorage };
