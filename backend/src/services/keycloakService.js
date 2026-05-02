const axios = require('axios');

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function getKeycloakConfig() {
  const enabled = String(process.env.KEYCLOAK_ENABLED || 'false') === 'true';
  const baseUrl = normalizeBaseUrl(process.env.KEYCLOAK_URL || 'http://localhost:8080');
  const realm = String(process.env.KEYCLOAK_REALM || 'routeshred').trim();
  const clientId = String(process.env.KEYCLOAK_CLIENT_ID || 'routeshred-frontend').trim();

  const realmBase = `${baseUrl}/realms/${realm}`;

  return {
    enabled: enabled && Boolean(baseUrl && realm && clientId),
    baseUrl,
    realm,
    clientId,
    realmBase,
    authorizationEndpoint: `${realmBase}/protocol/openid-connect/auth`,
    tokenEndpoint: `${realmBase}/protocol/openid-connect/token`,
    userinfoEndpoint: `${realmBase}/protocol/openid-connect/userinfo`,
    endSessionEndpoint: `${realmBase}/protocol/openid-connect/logout`
  };
}

async function fetchUserInfo(accessToken) {
  const cfg = getKeycloakConfig();
  if (!cfg.enabled) {
    throw new Error('Keycloak auth is disabled');
  }

  const response = await axios.get(cfg.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeout: 12000
  });

  return response.data || {};
}

module.exports = {
  getKeycloakConfig,
  fetchUserInfo
};
