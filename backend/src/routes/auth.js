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
  res.json({ user: req.auth.user });
});

module.exports = router;
