import React, { useEffect, useMemo, useState } from 'react';
import { FiUsers } from 'react-icons/fi';
import { t } from '../i18n';
import '../styles/Header.css';

function Header({
  authEnabled,
  authReady,
  authenticated,
  userName,
  onLogin,
  onLogout,
  onSelectTab,
  showMapToggle,
  isMapVisible,
  onToggleMapVisibility
}) {
  const [activeTab, setActiveTab] = useState('plan');

  const topTabs = useMemo(() => {
    const tabs = ['plan'];
    if (authEnabled && authReady && authenticated) {
      tabs.push('routes', 'community');
    }
    tabs.push('setup');
    return tabs;
  }, [authEnabled, authReady, authenticated]);

  useEffect(() => {
    const onTabChanged = (event) => {
      const next = String(event?.detail?.tab || '').trim();
      if (next) {
        setActiveTab(next);
      }
    };

    window.addEventListener('routeshred:tab-changed', onTabChanged);
    return () => window.removeEventListener('routeshred:tab-changed', onTabChanged);
  }, []);

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-top">
          <div className="header-brand">
            <span className="header-signet" aria-hidden="true">RS</span>
            <div className="header-brand-copy">
              <h1>RouteShred</h1>
              <p>{t('app.tagline')}</p>
            </div>
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
                <button className="header-btn" type="button" onClick={onLogout}>
                  {t('auth.logoutButton')}
                </button>
              </>
            )}

            {authEnabled && authReady && !authenticated && (
              <button className="header-btn" type="button" onClick={onLogin}>
                {t('auth.loginButtonShort')}
              </button>
            )}
          </div>
        </div>

        {showMapToggle && (
          <nav className="header-tabs" role="tablist" aria-label={t('route.tabs.label')}>
            {topTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={isActive ? 'active' : ''}
                  onClick={() => onSelectTab(tab)}
                >
                  {tab === 'community' ? <FiUsers size={13} /> : null}
                  {t(`route.tabs.${tab}`)}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
