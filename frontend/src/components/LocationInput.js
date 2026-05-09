import React, { useEffect, useRef, useState } from 'react';
import { FiCrosshair, FiX } from 'react-icons/fi';
import { activeLanguage, t } from '../i18n';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

function LocationInput({
  label,
  value,
  point,
  placeholder,
  onSelect,
  onClear,
  onUseCurrentLocation,
  currentLocationLoading = false,
  currentLocationDisabled = false
}) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const skipSearchRef = useRef(false);
  const quickControllerRef = useRef(null);
  const fullControllerRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
    skipSearchRef.current = true;
  }, [value]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return undefined;
    }

    const normalized = query.trim();
    if (normalized.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }

    if (quickControllerRef.current) quickControllerRef.current.abort();
    if (fullControllerRef.current) fullControllerRef.current.abort();

    const quickController = new AbortController();
    const fullController = new AbortController();
    quickControllerRef.current = quickController;
    fullControllerRef.current = fullController;

    const params = new URLSearchParams({ q: normalized, limit: '6', lang: activeLanguage });
    setLoading(true);

    // Phase 1: fast Nominatim-only results at 150ms
    const quickTimeout = window.setTimeout(() => {
      fetch(`${API_BASE}/geocode/search/quick?${params}`, {
        signal: quickController.signal
      }).then((r) => r.json()).then((data) => {
        const places = Array.isArray(data.places) ? data.places : [];
        if (places.length > 0) {
          setResults(places);
          setOpen(true);
          setLoading(false);
        }
      }).catch((err) => {
        if (err.name !== 'AbortError') setLoading(false);
      });
    }, 150);

    // Phase 2: full results with POI at 650ms — by then quick cache is warm, avoiding duplicate Nominatim hit
    const fullTimeout = window.setTimeout(() => {
      fetch(`${API_BASE}/geocode/search?${params}`, {
        signal: fullController.signal
      }).then((r) => r.json()).then((data) => {
        const places = Array.isArray(data.places) ? data.places : [];
        setResults(places);
        setOpen(true);
        setLoading(false);
      }).catch((err) => {
        if (err.name !== 'AbortError') setLoading(false);
      });
    }, 650);

    return () => {
      window.clearTimeout(quickTimeout);
      window.clearTimeout(fullTimeout);
      quickController.abort();
      fullController.abort();
    };
  }, [query]);

  const handleSelect = (place) => {
    setQuery(place.label);
    setOpen(false);
    setResults([]);
    if (quickControllerRef.current) quickControllerRef.current.abort();
    if (fullControllerRef.current) fullControllerRef.current.abort();
    onSelect(place.point, place.label);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setLoading(false);
    onClear();
  };

  const handleUseCurrentLocation = () => {
    setOpen(false);
    setResults([]);
    onUseCurrentLocation();
  };

  return (
    <div className="location-input">
      <div className="location-input__label">
        <span>{label}</span>
        {onUseCurrentLocation && (
          <button
            type="button"
            className="location-current-btn"
            onClick={handleUseCurrentLocation}
            disabled={currentLocationDisabled || currentLocationLoading}
            title={t('route.locations.useCurrent')}
            aria-label={t('route.locations.useCurrent')}
          >
            <FiCrosshair />
            <small>{currentLocationLoading ? t('route.locations.locating') : t('route.locations.useCurrentShort')}</small>
          </button>
        )}
      </div>
      <div className="location-input__field">
        <input
          type="search"
          value={query}
          placeholder={placeholder || t('route.locations.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
        />
        {query && (
          <button type="button" onClick={handleClear} aria-label="Clear">
            <FiX />
          </button>
        )}
      </div>
      {open && (
        <div className="location-results">
          {loading && <div className="location-results__state">{t('route.locations.searching')}</div>}
          {!loading && results.length === 0 && (
            <div className="location-results__state">{t('route.locations.noResults')}</div>
          )}
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => handleSelect(place)}
            >
              <span>{place.label}</span>
              <small>{place.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LocationInput;
