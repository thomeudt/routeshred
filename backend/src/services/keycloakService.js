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

function getKeycloakBaseUrlCandidates(cfg = getKeycloakConfig()) {
  const urls = [cfg.baseUrl];

  if (/\/\/keycloak(?::|\/|$)/i.test(cfg.baseUrl)) {
    urls.push(cfg.baseUrl.replace(/\/\/keycloak(?::|\/|$)/i, '//localhost$1'));
  }

  if (/\/\/localhost(?::|\/|$)/i.test(cfg.baseUrl)) {
    urls.push(cfg.baseUrl.replace(/\/\/localhost(?::|\/|$)/i, '//keycloak$1'));
  }

  return [...new Set(urls.map(normalizeBaseUrl).filter(Boolean))];
}

function isRetryableKeycloakError(error) {
  if (!error.response) {
    return true;
  }

  return error.response.status >= 500;
}

async function fetchUserInfo(accessToken) {
  const cfg = getKeycloakConfig();
  if (!cfg.enabled) {
    throw new Error('Keycloak auth is disabled');
  }

  let lastError = null;
  for (const baseUrl of getKeycloakBaseUrlCandidates(cfg)) {
    try {
      const response = await axios.get(`${baseUrl}/realms/${cfg.realm}/protocol/openid-connect/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 12000
      });

      return response.data || {};
    } catch (error) {
      lastError = error;
      if (!isRetryableKeycloakError(error)) {
        break;
      }
    }
  }

  throw lastError || new Error('Could not fetch Keycloak userinfo');
}

async function getAdminAccessToken(cfg) {
  const adminUser = process.env.KEYCLOAK_ADMIN;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

  if (!cfg.enabled || !adminUser || !adminPassword) {
    return null;
  }

  let lastError = null;
  for (const baseUrl of getKeycloakBaseUrlCandidates(cfg)) {
    try {
      const tokenResponse = await axios.post(
        `${baseUrl}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: adminUser,
          password: adminPassword
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 12000
        }
      );

      const accessToken = tokenResponse.data && tokenResponse.data.access_token;
      if (accessToken) {
        return { accessToken, baseUrl };
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableKeycloakError(error)) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function searchKeycloakUsers(query = '', currentSub = '') {
  const cfg = getKeycloakConfig();
  const admin = await getAdminAccessToken(cfg);

  if (!admin) {
    return [];
  }

  const response = await axios.get(`${admin.baseUrl}/admin/realms/${cfg.realm}/users`, {
    params: {
      search: String(query || '').trim(),
      max: 12
    },
    headers: {
      Authorization: `Bearer ${admin.accessToken}`
    },
    timeout: 12000
  });

  const current = String(currentSub || '').trim();
  return (Array.isArray(response.data) ? response.data : [])
    .filter((user) => user && user.id && user.id !== current)
    .map((user) => ({
      id: user.id,
      label: user.firstName || user.lastName
        ? [user.firstName, user.lastName].filter(Boolean).join(' ')
        : (user.username || user.email || user.id),
      detail: user.email || user.username || user.id
    }));
}

async function getKeycloakUsersByIds(ids = []) {
  const cfg = getKeycloakConfig();
  const wanted = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);

  if (!wanted.length) {
    return [];
  }

  const admin = await getAdminAccessToken(cfg);
  if (!admin) {
    return [];
  }

  const users = [];
  for (const id of wanted) {
    try {
      const response = await axios.get(`${admin.baseUrl}/admin/realms/${cfg.realm}/users/${id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        timeout: 12000
      });
      const user = response.data || {};
      users.push({
        id: user.id || id,
        label: user.firstName || user.lastName
          ? [user.firstName, user.lastName].filter(Boolean).join(' ')
          : (user.username || user.email || id),
        detail: user.email || user.username || id
      });
    } catch (_) {
      // Keep resolving the remaining users.
    }
  }

  return users;
}

module.exports = {
  getKeycloakConfig,
  fetchUserInfo,
  searchKeycloakUsers,
  getKeycloakUsersByIds
};
