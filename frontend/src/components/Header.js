import React from 'react';
import { t } from '../i18n';
import '../styles/Header.css';

function Header({
  authEnabled,
  authReady,
  authenticated,
  userName,
  onLogin,
  onLogout,
  onSaveProfile,
  profileSaveState,
  showMapToggle,
  isMapVisible,
  onToggleMapVisibility
}) {
  const saveLabel = profileSaveState === 'saving'
    ? 'Saving...'
    : profileSaveState === 'saved'
      ? 'Saved'
      : profileSaveState === 'error'
        ? 'Save failed'
        : 'Save profile';

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-brand">
          <h1>RouteShred</h1>
          <p>{t('app.tagline')}</p>
        </div>

        <div className="header-auth">
          {showMapToggle && (
            <button className="header-btn" type="button" onClick={onToggleMapVisibility}>
              {isMapVisible ? t('map.hideMap') : t('map.showMap')}
            </button>
          )}

          {authEnabled && authReady && authenticated && (
            <>
              <span className="user-pill">{userName}</span>
              <button className="header-btn" type="button" onClick={onSaveProfile}>
                {saveLabel}
              </button>
              <button className="header-btn" type="button" onClick={onLogout}>
                Logout
              </button>
            </>
          )}

          {authEnabled && authReady && !authenticated && (
            <button className="header-btn" type="button" onClick={onLogin}>
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
