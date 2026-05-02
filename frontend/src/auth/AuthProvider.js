import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';

const AuthContext = createContext(null);

const KEYCLOAK_ENABLED = String(process.env.REACT_APP_KEYCLOAK_ENABLED || 'true') === 'true';
const KEYCLOAK_CONFIG = {
  url: process.env.REACT_APP_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.REACT_APP_KEYCLOAK_REALM || 'routeshred',
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'routeshred-frontend'
};

let keycloakClient = null;
let keycloakInitPromise = null;

const AUTH_STORAGE_KEY = 'routeshred.auth.tokens';

function readStoredTokens() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const refreshToken = typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '';
    const idToken = typeof parsed.idToken === 'string' ? parsed.idToken : '';
    if (!token || !refreshToken) {
      return null;
    }

    return { token, refreshToken, idToken };
  } catch (_) {
    return null;
  }
}

function writeStoredTokens(tokens) {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
  } catch (_) {
    // Ignore storage write failures.
  }
}

function clearStoredTokens() {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (_) {
    // Ignore storage removal failures.
  }
}

function getKeycloakClient() {
  if (!KEYCLOAK_ENABLED) {
    return null;
  }

  if (!keycloakClient) {
    keycloakClient = new Keycloak(KEYCLOAK_CONFIG);
  }

  return keycloakClient;
}

export function AuthProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!KEYCLOAK_ENABLED) {
        if (mounted) {
          setInitialized(true);
        }
        return;
      }

      try {
        const client = getKeycloakClient();
        // Cache the init promise – React StrictMode runs effects twice in dev.
        // A second init() call on the same instance would fail (code already consumed from URL).
        if (!keycloakInitPromise) {
          const storedTokens = readStoredTokens();
          keycloakInitPromise = client.init({
            // Do not run automatic SSO checks on load in multi-proxy setups.
            // This avoids browser-dependent hangs on Keycloak's 3p-cookies check pages.
            // Login remains explicit via the login button.
            checkLoginIframe: false,
            pkceMethod: 'S256',
            ...(storedTokens || {})
          });
        }
        const isAuthenticated = await keycloakInitPromise;

        if (!mounted) {
          return;
        }

        setAuthenticated(Boolean(isAuthenticated));
        setToken(client.token || null);
        setUser(client.tokenParsed || null);

        if (isAuthenticated && client.token && client.refreshToken) {
          writeStoredTokens({
            token: client.token,
            refreshToken: client.refreshToken,
            idToken: client.idToken || ''
          });
        } else if (!isAuthenticated) {
          clearStoredTokens();
        }

        client.onTokenExpired = async () => {
          try {
            await client.updateToken(30);
            if (!mounted) return;
            setToken(client.token || null);
            setUser(client.tokenParsed || null);
            setAuthenticated(Boolean(client.authenticated));
            if (client.authenticated && client.token && client.refreshToken) {
              writeStoredTokens({
                token: client.token,
                refreshToken: client.refreshToken,
                idToken: client.idToken || ''
              });
            }
          } catch (_) {
            if (!mounted) return;
            setAuthenticated(false);
            setToken(null);
            setUser(null);
            clearStoredTokens();
          }
        };
      } catch (_) {
        if (mounted) {
          setAuthenticated(false);
          setToken(null);
          setUser(null);
        }
        clearStoredTokens();
      } finally {
        if (mounted) {
          setInitialized(true);
        }
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!KEYCLOAK_ENABLED || !authenticated) {
      return undefined;
    }

    const interceptorId = axios.interceptors.request.use(async (config) => {
      const url = String(config.url || '');
      const isApiRequest = url.startsWith('/api') || url.includes('/api/');
      if (!isApiRequest) {
        return config;
      }

      const client = getKeycloakClient();
      if (!client || !client.authenticated) {
        return config;
      }

      try {
        await client.updateToken(30);
        setToken(client.token || null);
        setUser(client.tokenParsed || null);
        setAuthenticated(Boolean(client.authenticated));

        config.headers = {
          ...(config.headers || {}),
          Authorization: `Bearer ${client.token}`
        };
      } catch (_) {
        setAuthenticated(false);
        setToken(null);
        setUser(null);
        clearStoredTokens();
        if (config.headers) {
          delete config.headers.Authorization;
          delete config.headers.authorization;
        }
      }

      return config;
    });

    return () => {
      axios.interceptors.request.eject(interceptorId);
    };
  }, [authenticated]);

  useEffect(() => {
    if (!KEYCLOAK_ENABLED) {
      return undefined;
    }

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = Number(error?.response?.status || 0);
        const message = String(error?.response?.data?.message || '').toLowerCase();
        const isAuthError = status === 401
          && (message.includes('invalid or expired access token') || message.includes('bearer token required'));

        if (isAuthError) {
          setAuthenticated(false);
          setToken(null);
          setUser(null);
          clearStoredTokens();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  const value = useMemo(() => ({
    enabled: KEYCLOAK_ENABLED,
    initialized,
    authenticated,
    token,
    user,
    login: async () => {
      if (!KEYCLOAK_ENABLED) return;
      const client = getKeycloakClient();
      await client.login({ redirectUri: window.location.href });
    },
    logout: async () => {
      if (!KEYCLOAK_ENABLED) return;
      const client = getKeycloakClient();
      clearStoredTokens();
      await client.logout({ redirectUri: window.location.origin });
    }
  }), [authenticated, initialized, token, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
