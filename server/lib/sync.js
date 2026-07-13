const http = require('http');
const https = require('https');

function createObserverSync(blockchain, config, logger = null) {
  const producerUrl = config.node?.producerUrl || '';
  const batchSize = Number(config.node?.sync?.batchSize ?? 50);
  const intervalMs = Number(config.node?.sync?.intervalMs ?? 2000);
  const timeoutMs = Number(config.node?.sync?.timeoutMs ?? 5000);
  const maxBatch = Math.min(200, Math.max(1, batchSize));

  let timer = null;
  let inFlight = false;
  let lastError = null;
  let syncState = 'syncing';
  let lastProgressLogAt = 0;

  function setStatus(update) {
    blockchain.setSyncStatus({
      producerUrl,
      syncState,
      lastSyncError: lastError,
      ...update
    });
  }

  async function fetchBlocks(fromHeight) {
    const url = new URL('/api/blocks', producerUrl);
    url.searchParams.set('fromHeight', String(fromHeight));
    url.searchParams.set('limit', String(maxBatch));

    const client = url.protocol === 'https:' ? https : http;

    return await new Promise((resolve, reject) => {
      const req = client.request(
        url,
        { method: 'GET', timeout: timeoutMs },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`producer ${res.statusCode}: ${res.statusMessage}`));
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('producer request timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  async function tick() {
    if (inFlight) return;
    if (!producerUrl) {
      syncState = 'error';
      lastError = 'producerUrl not configured';
      setStatus({ syncState, lastSyncError: lastError });
      return;
    }
    inFlight = true;
    try {
      const localHeight = blockchain.getLatestHeight();
      const response = await fetchBlocks(localHeight + 1);

      const status = blockchain.getState();
      if (response.chainId && response.chainId !== status.chainId) {
        throw new Error('producer chainId mismatch');
      }
      if (response.genesisHash && response.genesisHash !== status.genesisHash) {
        throw new Error('producer genesisHash mismatch');
      }
      if (response.protocolVersion && response.protocolVersion !== status.protocolVersion) {
        throw new Error('producer protocolVersion mismatch');
      }
      if (response.economicsVersion && response.economicsVersion !== status.economicsVersion) {
        throw new Error('producer economicsVersion mismatch');
      }

      const producerHeight = Number(response.latestHeight ?? response.producerHeight ?? localHeight);
      const blocks = Array.isArray(response.blocks) ? response.blocks : [];
      if (!blocks.length) {
        syncState = producerHeight > localHeight ? 'syncing' : 'synced';
        lastError = null;
        setStatus({
          syncState,
          lastSyncError: null,
          syncedHeight: localHeight,
          producerHeight,
          lagBlocks: Math.max(0, producerHeight - localHeight),
          lastSyncAt: new Date().toISOString()
        });
        return;
      }

      let appliedHeight = localHeight;
      for (const block of blocks) {
        const result = blockchain.applyExternalBlock(block);
        if (!result.ok) {
          if (logger) logger.error('block_validation_failed', {
            operation: 'observer_sync',
            blockHeight: block.height,
            errorCode: result.code || 'BLOCK_VALIDATION_FAILED'
          }, 'Invalid producer block rejected');
          throw new Error(result.error || 'block validation failed');
        }
        appliedHeight = block.height;
      }

      syncState = producerHeight > appliedHeight ? 'syncing' : 'synced';
      lastError = null;
      setStatus({
        syncState,
        lastSyncError: null,
        syncedHeight: appliedHeight,
        producerHeight,
        lagBlocks: Math.max(0, producerHeight - appliedHeight),
        lastSyncAt: new Date().toISOString()
      });
      const lagBlocks = Math.max(0, producerHeight - appliedHeight);
      const now = Date.now();
      if (logger && (syncState === 'synced' || appliedHeight - localHeight >= 100 || now - lastProgressLogAt > 30000)) {
        logger.info(syncState === 'synced' ? 'observer_sync_completed' : 'observer_sync_progress', {
          operation: 'observer_sync',
          startingHeight: localHeight,
          blockHeight: appliedHeight,
          targetHeight: producerHeight,
          syncLag: lagBlocks,
          blocksApplied: blocks.length
        }, syncState === 'synced' ? 'Observer sync completed' : 'Observer sync progress');
        lastProgressLogAt = now;
      }
    } catch (err) {
      syncState = 'error';
      lastError = err && err.message ? err.message : String(err);
      setStatus({
        syncState,
        lastSyncError: lastError,
        lastSyncAt: new Date().toISOString()
      });
      if (logger) logger.warn('observer_sync_failed', {
        operation: 'observer_sync',
        errorCode: err.code || 'OBSERVER_SYNC_FAILED',
        error: err
      }, 'Observer sync failed');
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    if (logger) logger.info('observer_sync_started', {
      operation: 'observer_sync',
      producerUrlConfigured: Boolean(producerUrl),
      startingHeight: blockchain.getLatestHeight(),
      batchSize: maxBatch
    }, 'Observer sync started');
    tick();
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop };
}

module.exports = { createObserverSync };
