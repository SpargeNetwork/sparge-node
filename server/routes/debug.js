const express = require('express');
const { isLocalRequest } = require('../lib/httpSecurity');

function debugRouter(blockchain) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (process.env.DEBUG_INVARIANTS !== 'true') {
      res.status(404).json({ error: 'debug disabled' });
      return;
    }
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: 'local only' });
      return;
    }
    next();
  });

  router.get('/invariants', (req, res) => {
    res.json(blockchain.checkInvariants());
  });

  return router;
}

module.exports = { debugRouter };
