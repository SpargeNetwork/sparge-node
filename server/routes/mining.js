const express = require('express');
const { isLocalRequest } = require('../lib/httpSecurity');

function miningRouter(miner, config) {
  const router = express.Router();
  const adminEnabled = Boolean(config?.dev?.enableAdmin);

  const requireLocalAdmin = (req, res, next) => {
    if (!adminEnabled) {
      res.status(404).json({ error: 'admin endpoint disabled' });
      return;
    }
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: 'local only' });
      return;
    }
    next();
  };

  router.post('/start', requireLocalAdmin, (req, res) => {
    const started = miner.start();
    res.json({ active: true, started });
  });

  router.post('/stop', requireLocalAdmin, (req, res) => {
    miner.stop();
    res.json({ active: false });
  });

  router.get('/status', (req, res) => {
    res.json(miner.status());
  });

  return router;
}

module.exports = { miningRouter };
