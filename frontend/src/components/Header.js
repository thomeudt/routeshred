import React from 'react';
import { t } from '../i18n';
import '../styles/Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <h1>RouteShred</h1>
        <p>{t('app.tagline')}</p>
      </div>
    </header>
  );
}

export default Header;
