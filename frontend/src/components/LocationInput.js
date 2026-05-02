import React, { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { activeLanguage, t } from '../i18n';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

function LocationInput({ label, value, point, onSelect, onClear }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const skipSearchRef = useRef(false);

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
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: normalized,
          limit: '6',
          lang: activeLanguage
        });
        const response = await fetch(`${API_BASE}/geocode/search?${params}`, {
          signal: controller.signal
        });
        const data = await response.json();
        setResults(Array.isArray(data.places) ? data.places : []);
        setOpen(true);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setResults([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (place) => {
    setQuery(place.label);
    setOpen(false);
    setResults([]);
    onSelect(place.point, place.label);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onClear();
  };

  return (
    <div className="location-input">
      <div className="location-input__label">
        <span>{label}</span>
        {point && <small>{point[0].toFixed(4)}, {point[1].toFixed(4)}</small>}
      </div>
      <div className="location-input__field">
        <input
          type="search"
          value={query}
          placeholder={t('route.locations.searchPlaceholder')}
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
          {!loading && results.map((place) => (
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
