const http = require('http');
const https = require('https');
const { getOrCreateNodeIdentity } = require('./observerNodeIdentity');
const { getObserverPrivacySettings } = require('./observerPrivacy');
const { getSoftwareVersion } = require('./softwareVersion');

function postJson(url, payload, timeoutMs) {
  const body = JSON.stringify(payload);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`heartbeat ${res.statusCode}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('heartbeat timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

function createObserverHeartbeatClient(blockchain, config, dataDir, logger = null) {
  const producerUrl = config.node?.producerUrl || '';
  const intervalMs = Math.max(10, Number(config.network?.heartbeatIntervalSeconds ?? 60)) * 1000;
  const timeoutMs = Number(config.node?.sync?.timeoutMs ?? 5000);
  const identity = getOrCreateNodeIdentity(dataDir, config);
  let timer = null;
  let inFlight = false;
  let lastLogAt = 0;

  async function send() {
    if (inFlight || !producerUrl) return;
    inFlight = true;
    try {
      const state = blockchain.getState();
      const url = new URL('/api/network/heartbeat', producerUrl);
      const privacy = getObserverPrivacySettings(config, dataDir);
      await postJson(url, {
        nodeId: identity.nodeId,
        nodeMode: 'observer',
        version: getSoftwareVersion(config),
        height: Number(state.syncedHeight ?? state.latestHeight ?? 0),
        latestHash: state.latestHash || state.latestBlock?.hash || '',
        publicListingEnabled: privacy.publicListingEnabled,
        publicAlias: privacy.publicListingEnabled && privacy.publicAlias ? privacy.publicAlias : null,
        countryCode: privacy.publicListingEnabled && privacy.countryCode ? privacy.countryCode : null
      }, timeoutMs);
    } catch (err) {
      const now = Date.now();
      if (now - lastLogAt > 60000) {
        if (logger) logger.warn('observer_sync_failed', {
          operation: 'observer_heartbeat',
          errorCode: err.code || 'HEARTBEAT_FAILED',
          error: err
        }, 'Observer heartbeat failed');
        lastLogAt = now;
      }
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    send();
    timer = setInterval(send, intervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, send, identity };
}

module.exports = { createObserverHeartbeatClient };
