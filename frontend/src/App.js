import React, { useEffect, useState } from 'react';
import axios from 'axios';
import MapComponent from './components/MapComponent';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { useRouteStore } from './store/routeStore';
import { useAuth } from './auth/AuthProvider';
import { t } from './i18n';
import './App.css';

function App() {
  const { enabled, initialized, authenticated, token, user, login, logout } = useAuth();
  const {
    setRiderProfile,
    setBikeType,
    setRideType,
    loadSavedRoute,
    loadPublicRoute
  } = useRouteStore();
  const [isMapVisible, setIsMapVisible] = useState(true);
  const [sharedRouteTarget] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const routeId = String(params.get('sharedRoute') || '').trim();
    const owner = String(params.get('owner') || '').trim();
    if (!routeId || !owner) {
      return null;
    }
    return { routeId, owner };
  });
  const [groupRideTarget] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const rideId = String(params.get('groupRide') || '').trim();
    const owner = String(params.get('owner') || '').trim();
    if (!rideId || !owner) {
      return null;
    }
    return { rideId, owner };
  });

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!enabled || !authenticated || !token) {
        return;
      }

      try {
        const response = await axios.get('/api/profile', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const profile = response.data && response.data.profile ? response.data.profile : null;
        if (!mounted || !profile) {
          return;
        }

        if (profile.riderProfile) {
          await setRiderProfile(profile.riderProfile);
        }
        if (profile.bikeType) {
          await setBikeType(profile.bikeType);
        }
        if (profile.rideType) {
          await setRideType(profile.rideType);
        }
      } catch (_) {
        // Keep defaults when profile loading fails.
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [enabled, authenticated, token, setRiderProfile, setBikeType, setRideType]);

  useEffect(() => {
    if (!sharedRouteTarget) {
      return;
    }

    if (enabled && initialized && authenticated && token) {
      loadSavedRoute(token, sharedRouteTarget.routeId, sharedRouteTarget.owner);
      return;
    }

    loadPublicRoute(sharedRouteTarget.routeId, sharedRouteTarget.owner);
  }, [enabled, initialized, authenticated, token, sharedRouteTarget, loadSavedRoute, loadPublicRoute]);

  useEffect(() => {
    if (!groupRideTarget) {
      return;
    }

    window.dispatchEvent(new CustomEvent('routeshred:set-tab', { detail: { tab: 'community' } }));
  }, [groupRideTarget]);

  const hasPublicDeepLink = Boolean(sharedRouteTarget || groupRideTarget);
  const showAuthGate = enabled && !initialized && !hasPublicDeepLink;
  const showLoginScreen = enabled && initialized && !authenticated && !hasPublicDeepLink;
  const handleToggleMapVisibility = () => {
    setIsMapVisible((visible) => !visible);
  };

  const handleSelectTab = (tab) => {
    window.dispatchEvent(new CustomEvent('routeshred:set-tab', { detail: { tab } }));
  };

  if (showAuthGate) {
    return (
      <div className="App">
        <main className="auth-boot-screen">
          <div className="auth-boot-mark">RouteShred</div>
          <div className="auth-boot-loader" aria-hidden="true" />
          <span>{t('common.loading')}</span>
        </main>
      </div>
    );
  }

  return (
    <div className="App">
      <Header
        authEnabled={enabled}
        authReady={initialized}
        authenticated={authenticated}
        userName={user?.name || user?.preferred_username || 'Rider'}
        onLogin={login}
        onLogout={logout}
        onSelectTab={handleSelectTab}
        showMapToggle={!showLoginScreen}
        isMapVisible={isMapVisible}
        onToggleMapVisibility={handleToggleMapVisibility}
      />
      {showLoginScreen ? (
        <main className="login-screen">
          <div className="login-card">
            <h2>{t('auth.loginRequiredTitle')}</h2>
            <p>
              {t('auth.loginRequiredBody')}
            </p>
            <button type="button" className="login-btn" onClick={login}>
              {t('auth.loginButton')}
            </button>
          </div>
        </main>
      ) : (
        <MapComponent isMapVisible={isMapVisible} />
      )}
      {!showLoginScreen && <BottomNav />}
    </div>
  );
}

export default App;
