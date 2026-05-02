import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { activeLanguage } from './i18n';
import 'leaflet/dist/leaflet.css';
import './index.css';

document.documentElement.lang = activeLanguage;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
