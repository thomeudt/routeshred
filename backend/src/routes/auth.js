const express = require('express');
const router = express.Router();
const { getKeycloakConfig } = require('../services/keycloakService');
const { requireAuth } = require('../middleware/auth');

router.get('/config', (req, res) => {
  const cfg = getKeycloakConfig();
  res.json({
    enabled: cfg.enabled,
    url: cfg.baseUrl,
    realm: cfg.realm,
    clientId: cfg.clientId,
    authorizationEndpoint: cfg.authorizationEndpoint,
    tokenEndpoint: cfg.tokenEndpoint,
    endSessionEndpoint: cfg.endSessionEndpoint
  });
});

router.get('/me', requireAuth, (req, res) => {
  const { sub, email, preferred_username, name } = req.auth.user || {};
  res.json({ user: { sub, email, preferred_username, name } });
});

module.exports = router;
