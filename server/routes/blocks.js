const express = require('express');
const { createRateLimiter } = require('../lib/httpSecurity');

function blocksRouter(blockchain, config) {
  const router = express.Router();
  const syncRateLimitCfg = config?.http?.blocksSyncRateLimit || { windowMs: 60000, max: 120 };
  const syncRateLimiter = createRateLimiter({
    ...syncRateLimitCfg,
    keyFn: (req) => req.ip || req.socket?.remoteAddress || 'unknown'
  });

  router.get('/', (req, res) => {
    if (req.query.fromHeight !== undefined) {
      syncRateLimiter(req, res, () => {});
      if (res.headersSent) return;

      const fromRaw = Number(req.query.fromHeight);
      const limitRaw = req.query.limit === undefined ? 50 : Number(req.query.limit);
      if (!Number.isFinite(fromRaw) || !Number.isInteger(fromRaw) || fromRaw < 0) {
        res.status(400).json({ error: 'fromHeight must be a non-negative integer' });
        return;
      }
      if (!Number.isFinite(limitRaw) || !Number.isInteger(limitRaw) || limitRaw < 1) {
        res.status(400).json({ error: 'limit must be a positive integer' });
        return;
      }

      const fromHeight = fromRaw;
      const limit = Math.min(200, limitRaw);
      const blocks = blockchain.getBlocksFromHeight(fromHeight, limit);
      const state = blockchain.getState();
      res.json({
        chainId: state.chainId,
        genesisHash: state.genesisHash,
        protocolVersion: state.protocolVersion,
        economicsVersion: state.economicsVersion,
        fromHeight,
        latestHeight: state.latestHeight,
        blocks
      });
      return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const { total, blocks } = blockchain.getBlocks(offset, limit);
    res.json({
      total,
      page,
      limit,
      blocks
    });
  });

  router.get('/state', (req, res) => {
    res.json(blockchain.getState());
  });

  return router;
}

module.exports = { blocksRouter };
