import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
          keycloakInitPromise = client.init({
            onLoad: 'check-sso',
            checkLoginIframe: false,
            pkceMethod: 'S256',
            silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`
          });
        }
        const isAuthenticated = await keycloakInitPromise;

        if (!mounted) {
          return;
        }

        setAuthenticated(Boolean(isAuthenticated));
        setToken(client.token || null);
        setUser(client.tokenParsed || null);

        client.onTokenExpired = async () => {
          try {
            await client.updateToken(30);
            if (!mounted) return;
            setToken(client.token || null);
            setUser(client.tokenParsed || null);
            setAuthenticated(Boolean(client.authenticated));
          } catch (_) {
            if (!mounted) return;
            setAuthenticated(false);
            setToken(null);
            setUser(null);
          }
        };
      } catch (_) {
        if (mounted) {
          setAuthenticated(false);
          setToken(null);
          setUser(null);
        }
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
