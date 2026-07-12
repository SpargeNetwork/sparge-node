const { runValidation } = require('./validation/middleware');
const { heartbeatBody } = require('./validation/schemas');

function validateHeartbeat(input) {
  return runValidation(heartbeatBody, input);
}

function getRemoteIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

function createObserverRegistry(storage, config) {
  const retentionDays = Number(config.network?.observerRetentionDays ?? 180);

  function registerHeartbeat(payload, remoteIp, now = Date.now()) {
    storage.upsertObserverNode({
      nodeId: payload.nodeId,
      remoteIp,
      publicListingEnabled: payload.publicListingEnabled,
      publicAlias: payload.publicAlias,
      countryCode: payload.countryCode,
      version: payload.version,
      height: payload.height,
      latestHash: payload.latestHash,
      firstSeen: now,
      lastSeen: now
    });
  }

  function cleanup(now = Date.now()) {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    return storage.deleteObserverNodesLastSeenBefore(cutoff);
  }

  return { registerHeartbeat, cleanup };
}

module.exports = {
  validateHeartbeat,
  getRemoteIp,
  createObserverRegistry
};
