const express = require('express');
const { createRateLimiter } = require('../lib/httpSecurity');
const { validateQuery } = require('../lib/validation/middleware');
const { blocksQuery } = require('../lib/validation/schemas');

function blocksRouter(blockchain, config) {
  const router = express.Router();
  const syncRateLimitCfg = config?.http?.blocksSyncRateLimit || { windowMs: 60000, max: 120 };
  const syncRateLimiter = createRateLimiter({
    ...syncRateLimitCfg,
    keyFn: (req) => req.ip || req.socket?.remoteAddress || 'unknown'
  });

  router.get('/', validateQuery(blocksQuery), (req, res) => {
    if (req.query.fromHeight !== undefined) {
      syncRateLimiter(req, res, () => {});
      if (res.headersSent) return;

      const fromHeight = req.query.fromHeight;
      const limit = req.query.limit;
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

    const page = req.query.page;
    const limit = req.query.limit;
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
