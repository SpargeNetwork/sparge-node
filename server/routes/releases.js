const express = require('express');
const { publicObserverRelease } = require('../lib/observerDownloads');

function releasesRouter(config) {
  const router = express.Router();
  router.get('/observer/latest', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(publicObserverRelease(config));
  });
  return router;
}

module.exports = { releasesRouter };
