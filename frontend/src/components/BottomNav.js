import React, { useEffect, useMemo, useState } from 'react';
import { FiMap, FiBookmark, FiUsers, FiSettings } from 'react-icons/fi';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';
import '../styles/BottomNav.css';

const TAB_ICONS = {
  plan: FiMap,
  routes: FiBookmark,
  community: FiUsers,
  setup: FiSettings
};

function BottomNav() {
  const { enabled, initialized, authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('plan');

  const tabs = useMemo(() => {
    const result = ['plan'];
    if (enabled && initialized && authenticated) {
      result.push('routes', 'community');
    }
    result.push('setup');
    return result;
  }, [enabled, initialized, authenticated]);

  useEffect(() => {
    const onTabChanged = (event) => {
      const next = String(event?.detail?.tab || '').trim();
      if (next) setActiveTab(next);
    };
    window.addEventListener('routeshred:tab-changed', onTabChanged);
    return () => window.removeEventListener('routeshred:tab-changed', onTabChanged);
  }, []);

  return (
    <nav className="bottom-nav" role="tablist" aria-label={t('route.tabs.label')}>
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`bottom-nav-item${activeTab === tab ? ' active' : ''}`}
            onClick={() => window.dispatchEvent(new CustomEvent('routeshred:set-tab', { detail: { tab } }))}
          >
            <Icon aria-hidden="true" />
            <span>{t(`route.tabs.${tab}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
