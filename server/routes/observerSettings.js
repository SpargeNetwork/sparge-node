const express = require('express');
const { isLocalRequest } = require('../lib/httpSecurity');
const { getObserverPrivacySettings, saveObserverPrivacySettings } = require('../lib/observerPrivacy');
const { validateBody } = require('../lib/validation/middleware');
const { observerSettingsBody } = require('../lib/validation/schemas');

function observerSettingsRouter(config, dataDir) {
  const router = express.Router();

  const requireObserverLocal = (req, res, next) => {
    if (config.node?.mode !== 'observer') {
      res.status(404).json({ error: 'observer settings unavailable' });
      return;
    }
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: 'local only' });
      return;
    }
    next();
  };

  router.get('/settings', requireObserverLocal, (req, res) => {
    res.json(getObserverPrivacySettings(config, dataDir));
  });

  router.post('/settings', requireObserverLocal, validateBody(observerSettingsBody), (req, res) => {
    try {
      const settings = saveObserverPrivacySettings(dataDir, req.body);
      res.json({ ok: true, settings });
    } catch (err) {
      res.status(400).json({ error: err.message || 'invalid settings' });
    }
  });

  return router;
}

module.exports = { observerSettingsRouter };
