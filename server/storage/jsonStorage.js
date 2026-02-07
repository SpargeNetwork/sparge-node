const { appendBlock, loadBlocks, getLatestBlock, getBlocksPage, ensureDir } = require('../lib/storage');
const { loadLedger, saveLedger } = require('../lib/ledger');
const { loadMeta, saveMeta } = require('../lib/meta');

class JsonStorage {
  constructor(dataDir, config) {
    this.dataDir = dataDir;
    this.config = config;
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

  close() {}
}

module.exports = { JsonStorage };
