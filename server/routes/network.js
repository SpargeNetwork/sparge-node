const express = require('express');
const { createRateLimiter } = require('../lib/httpSecurity');
const { getRemoteIp, createObserverRegistry } = require('../lib/observerRegistry');
const { buildNetworkStatus, buildObserverList } = require('../lib/networkStatus');
const { validateBody, validateQuery } = require('../lib/validation/middleware');
const { heartbeatBody, observerListQuery } = require('../lib/validation/schemas');

function networkRouter(blockchain, storage, mempool, config, logger = null) {
  const router = express.Router();
  const registry = createObserverRegistry(storage, config);
  const rateLimits = config.security?.rateLimits || {};
  const heartbeatNodeLimiter = createRateLimiter({
    enabled: rateLimits.enabled !== false,
    ...(rateLimits.heartbeat || {}),
    max: rateLimits.heartbeat?.maxRequestsPerNodeId,
    keyFn: (req) => req.body?.nodeId || 'unknown',
    group: 'heartbeatNodeId'
  });

  router.post('/heartbeat', validateBody(heartbeatBody), heartbeatNodeLimiter, (req, res) => {
    registry.registerHeartbeat(req.body, getRemoteIp(req));
    registry.cleanup();
    const log = req.log || logger;
    if (log) log.info('observer_heartbeat_received', {
      operation: 'observer_heartbeat',
      nodeIdPrefix: String(req.body.nodeId || '').slice(0, 10),
      blockHeight: req.body.height,
      version: req.body.version || '',
      publicListingEnabled: req.body.publicListingEnabled === true
    }, 'Observer heartbeat received');
    res.json({ ok: true });
  });

  router.get('/status', (req, res) => {
    res.json(buildNetworkStatus(blockchain, storage, mempool, config));
  });

  router.get('/observers', validateQuery(observerListQuery), (req, res) => {
    if (config.network?.publicObserverListEnabled === false) {
      res.status(403).json({ error: 'public observer listing disabled' });
      return;
    }
    res.json(buildObserverList(blockchain, storage, config, req.query));
  });

  return router;
}

module.exports = { networkRouter };
