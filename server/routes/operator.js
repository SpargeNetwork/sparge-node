const fs = require('fs');
const path = require('path');
const express = require('express');
const { isLocalRequest } = require('../lib/httpSecurity');
const { buildNetworkStatus, averageBlockTimeSeconds } = require('../lib/networkStatus');
const { readBackupStatus } = require('../lib/backup');

function sameDayUtc(iso, now = Date.now()) {
  const time = new Date(iso || 0);
  if (!Number.isFinite(time.getTime())) return false;
  const today = new Date(now);
  return time.getUTCFullYear() === today.getUTCFullYear()
    && time.getUTCMonth() === today.getUTCMonth()
    && time.getUTCDate() === today.getUTCDate();
}

function databaseStatus(storage, dataDir, cache, now = Date.now()) {
  const files = ['state.db', 'state.db-wal', 'state.db-shm'];
  const sizeBytes = files.reduce((sum, file) => {
    try {
      return sum + fs.statSync(path.join(dataDir, file)).size;
    } catch {
      return sum;
    }
  }, 0);
  let integrityStatus = cache.integrityStatus || 'unknown';
  if (!cache.checkedAt || now - cache.checkedAt > 60000) {
    cache.checkedAt = now;
    try {
      if (storage?.db && typeof storage.db.pragma === 'function') {
        const result = storage.db.pragma('quick_check', { simple: true });
        integrityStatus = result === 'ok' ? 'ok' : 'failed';
      } else {
        integrityStatus = 'unknown';
      }
    } catch {
      integrityStatus = 'failed';
    }
    cache.integrityStatus = integrityStatus;
  }
  return {
    backend: storage?.db ? 'sqlite' : 'json',
    status: storage?.db ? 'online' : 'available',
    sizeBytes,
    integrityStatus,
    lastStartupAudit: null
  };
}

function buildAlerts(state, mining, network, db) {
  const alerts = [];
  if (state.healthy === false || state.invariantStatus === 'failed') {
    alerts.push({ level: 'critical', label: 'Critical', message: 'Invariant failure detected.' });
  }
  if (state.miningPausedForSafety) {
    alerts.push({ level: 'critical', label: 'Critical', message: 'Mining paused for safety.' });
  }
  if (state.storageHealthy === false || db.integrityStatus === 'failed') {
    alerts.push({ level: 'critical', label: 'Critical', message: 'Storage health failure.' });
  }
  if (network.mismatchObserverCount > 0) {
    alerts.push({ level: 'warning', label: 'Warning', message: 'Observer mismatch detected.' });
  }
  if (Number(network.averageObserverLag || 0) > 3) {
    alerts.push({ level: 'warning', label: 'Warning', message: 'Observer lag detected.' });
  }
  if (!mining.active) {
    alerts.push({ level: 'warning', label: 'Warning', message: 'Mining is not active.' });
  }
  return alerts;
}

function operatorRouter({ blockchain, storage, mempool, miner, config, dataDir, metrics }) {
  const router = express.Router();
  const dbCache = {};
  const root = path.join(__dirname, '..', 'operator');
  const enabled = () => config.operatorDashboard?.enabled === true && config.node?.mode !== 'observer';

  function requireOperatorAccess(req, res, next) {
    if (!enabled()) {
      res.status(404).send('Not found');
      return;
    }
    if (config.operatorDashboard?.bindLocalOnly !== false && !isLocalRequest(req)) {
      res.status(403).send('Local operator access only');
      return;
    }
    next();
  }

  router.use(requireOperatorAccess);

  router.get(['/operator', '/operator/'], (req, res) => {
    res.sendFile(path.join(root, 'dashboard.html'));
  });

  router.get('/operator/operator-dashboard.js', (req, res) => {
    res.sendFile(path.join(root, 'operator-dashboard.js'));
  });

  router.get('/api/operator/status', (req, res) => {
    const state = blockchain.getState();
    const blocks = storage.getAllBlocks ? storage.getAllBlocks() : [];
    const latestBlock = state.latestBlock || blocks[blocks.length - 1] || null;
    const todayBlocks = blocks.filter((block) => sameDayUtc(block.timestamp)).length;
    const network = buildNetworkStatus(blockchain, storage, mempool, config);
    const db = databaseStatus(storage, dataDir, dbCache);
    const backup = readBackupStatus(dataDir);
    const mining = miner && typeof miner.status === 'function'
      ? miner.status()
      : { active: false, pausedForSafety: true };
    const http = metrics ? metrics.snapshot() : {};
    const memory = process.memoryUsage();
    const alerts = buildAlerts(state, mining, network, db);
    res.json({
      generatedAt: new Date().toISOString(),
      alerts,
      node: {
        healthy: state.healthy !== false,
        producerRunning: config.node?.mode === 'producer',
        miningActive: mining.active === true,
        miningPaused: mining.pausedForSafety === true || state.miningPausedForSafety === true,
        version: state.softwareVersion || '',
        chainId: state.chainId,
        protocolVersion: state.protocolVersion,
        economicsVersion: state.economicsVersion,
        uptimeSeconds: Math.floor(process.uptime())
      },
      chain: {
        height: Number(state.latestHeight || 0),
        latestBlock: latestBlock
          ? {
              height: latestBlock.height,
              hashPrefix: String(latestBlock.hash || '').slice(0, 12),
              timestamp: latestBlock.timestamp || null,
              txCount: latestBlock.txCount || 0
            }
          : null,
        averageBlockTimeSeconds: averageBlockTimeSeconds(blocks, Number(state.blockTimeSeconds || 0)),
        blocksProducedToday: todayBlocks,
        transactionsProcessed: Number(state.totalTransactions || 0),
        mempoolTransactionCount: Number(state.mempoolTransactionCount || 0),
        mempoolBytes: Number(state.mempoolBytes || 0),
        mempoolMaxBytes: Number(state.mempoolMaxBytes || 0),
        mempoolUtilizationPercent: Number(state.mempoolUtilizationPercent || 0)
      },
      health: {
        chainHealthy: state.chainHealthy !== false,
        storageHealthy: state.storageHealthy !== false,
        mempoolHealthy: state.mempoolHealthy !== false,
        invariantsHealthy: state.invariantStatus !== 'failed',
        invariantStatus: state.invariantStatus || 'unknown',
        lastInvariantCheckAt: state.lastInvariantCheckAt || null,
        lastInvariantFailureCode: state.lastInvariantFailureCode || null,
        miningPausedForSafety: state.miningPausedForSafety === true
      },
      database: db,
      backup,
      network: {
        activeObservers: network.activeObserverCount,
        fullySyncedObservers: network.fullySyncedObserverCount,
        highestObserverHeight: network.highestObserverHeight,
        lowestObserverHeight: network.lowestObserverHeight,
        largestObserverLag: Math.max(0, Number(network.currentHeight || 0) - Number(network.lowestObserverHeight || 0)),
        producerApiStatus: 'online'
      },
      http: {
        requestsPerMinute: http.requestsPerMinute || 0,
        validationFailuresPerMinute: http.validationFailuresPerMinute || 0,
        rateLimitedRequestsPerMinute: http.rateLimitedRequestsPerMinute || 0,
        oversizedRequestRejectsPerMinute: http.oversizedRequestsPerMinute || 0,
        activeRequestCount: http.activeRequests || 0
      },
      system: {
        memoryRssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        nodeVersion: process.version,
        platform: process.platform,
        cpuCount: require('os').cpus().length,
        processUptimeSeconds: Math.floor(process.uptime())
      },
      recentEvents: http.recentEvents || []
    });
  });

  return router;
}

module.exports = {
  operatorRouter
};
