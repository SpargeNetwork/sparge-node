const express = require('express');

function mempoolRouter(mempool) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const transactions = mempool.list();
    const stats = typeof mempool.getStats === 'function' ? mempool.getStats() : { mempoolTransactionCount: transactions.length };
    res.json({ count: transactions.length, ...stats, transactions });
  });

  return router;
}

module.exports = { mempoolRouter };
