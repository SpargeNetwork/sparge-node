const express = require('express');

function mempoolRouter(mempool) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ count: mempool.list().length, transactions: mempool.list() });
  });

  return router;
}

module.exports = { mempoolRouter };
