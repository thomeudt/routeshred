const { fetchUserInfo, getKeycloakConfig } = require('../services/keycloakService');

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim();
}

async function requireAuth(req, res, next) {
  const cfg = getKeycloakConfig();
  if (!cfg.enabled) {
    return res.status(503).json({
      error: 'Auth not configured',
      message: 'Keycloak is disabled. Set KEYCLOAK_ENABLED=true and configure KEYCLOAK_URL/REALM/CLIENT_ID.'
    });
  }

  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
  }

  try {
    const userInfo = await fetchUserInfo(token);
    req.auth = {
      token,
      user: userInfo
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired access token' });
  }
}

module.exports = {
  requireAuth,
  parseBearerToken
};
