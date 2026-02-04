const express = require('express');

function blocksRouter(blockchain) {
  const router = express.Router();

  router.get('/', (req, res) => {
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