import React, { useEffect, useState } from 'react';
import axios from 'axios';
import MapComponent from './components/MapComponent';
import Header from './components/Header';
import { useRouteStore } from './store/routeStore';
import { useAuth } from './auth/AuthProvider';
import './App.css';

function App() {
  const { enabled, initialized, authenticated, token, user, login, logout } = useAuth();
  const {
    riderProfile,
    bikeType,
    rideType,
    setRiderProfile,
    setBikeType,
    setRideType
  } = useRouteStore();
  const [profileSaveState, setProfileSaveState] = useState('idle');
  const [isMapVisible, setIsMapVisible] = useState(true);

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

  const handleSaveProfile = async () => {
    if (!enabled || !authenticated || !token) {
      return;
    }

    setProfileSaveState('saving');
    try {
      await axios.put('/api/profile', {
        riderProfile,
        bikeType,
        rideType,
        displayName: user?.name || user?.preferred_username || 'Rider'
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setProfileSaveState('saved');
      setTimeout(() => setProfileSaveState('idle'), 1200);
    } catch (_) {
      setProfileSaveState('error');
      setTimeout(() => setProfileSaveState('idle'), 1800);
    }
  };

  const showLoginScreen = enabled && initialized && !authenticated;
  const handleToggleMapVisibility = () => {
    setIsMapVisible((visible) => !visible);
  };

  return (
    <div className="App">
      <Header
        authEnabled={enabled}
        authReady={initialized}
        authenticated={authenticated}
        userName={user?.name || user?.preferred_username || 'Rider'}
        onLogin={login}
        onLogout={logout}
        onSaveProfile={handleSaveProfile}
        profileSaveState={profileSaveState}
        showMapToggle={!showLoginScreen}
        isMapVisible={isMapVisible}
        onToggleMapVisibility={handleToggleMapVisibility}
      />
      {showLoginScreen ? (
        <main className="login-screen">
          <div className="login-card">
            <h2>Anmeldung erforderlich</h2>
            <p>
              Melde dich mit deinem RouteShred-Konto an, um Profile zu laden und zu speichern.
            </p>
            <button type="button" className="login-btn" onClick={login}>
              Mit Keycloak anmelden
            </button>
          </div>
        </main>
      ) : (
        <MapComponent isMapVisible={isMapVisible} />
      )}
    </div>
  );
}

export default App;
