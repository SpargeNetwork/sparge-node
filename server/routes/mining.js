const express = require('express');

function miningRouter(miner) {
  const router = express.Router();

  router.post('/start', (req, res) => {
    const started = miner.start();
    res.json({ active: true, started });
  });

  router.post('/stop', (req, res) => {
    miner.stop();
    res.json({ active: false });
  });

  router.get('/status', (req, res) => {
    res.json(miner.status());
  });

  return router;
}

module.exports = { miningRouter };