const express = require('express');

function blocksRouter(blockchain) {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.query.fromHeight !== undefined) {
      const fromHeight = Math.max(0, Number(req.query.fromHeight) || 0);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
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
