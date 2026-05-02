const axios = require('axios');
const { getCachedJson, setCachedJson } = require('../utils/diskCache');

const NOMINATIM_API = process.env.NOMINATIM_API || 'https://nominatim.openstreetmap.org/search';
const GEOCODING_CACHE_TTL_MS = Number(process.env.GEOCODING_CACHE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const GEOCODING_TIMEOUT_MS = Number(process.env.GEOCODING_TIMEOUT_MS || 10000);

async function searchPlaces(query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 3) {
    return [];
  }

  const limit = clamp(Number(options.limit) || 6, 1, 10);
  const language = String(options.language || 'de').slice(0, 8);
  const cacheKey = { query: normalizedQuery.toLowerCase(), limit, language };
  const cached = await getCachedJson('geocoding', cacheKey, GEOCODING_CACHE_TTL_MS);
  if (Array.isArray(cached)) {
    return cached;
  }

  const response = await axios.get(NOMINATIM_API, {
    params: {
      q: normalizedQuery,
      format: 'jsonv2',
      addressdetails: 1,
      limit
    },
    headers: {
      Accept: 'application/json',
      'Accept-Language': language,
      'User-Agent': 'RouteShred/0.1 (+local-dev)'
    },
    timeout: GEOCODING_TIMEOUT_MS
  });

  const places = Array.isArray(response.data)
    ? response.data.map(normalizePlace).filter(Boolean)
    : [];

  await setCachedJson('geocoding', cacheKey, places);
  return places;
}

function normalizePlace(place) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    id: String(place.place_id || `${lat},${lon}`),
    label: place.display_name,
    point: [lat, lon],
    type: place.type || place.class || 'place'
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  searchPlaces
};
