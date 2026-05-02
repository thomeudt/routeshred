import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { activeLanguage } from './i18n';
import 'leaflet/dist/leaflet.css';
import './index.css';

document.documentElement.lang = activeLanguage;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
