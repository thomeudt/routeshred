const axios = require('axios');
const { getCachedJson, setCachedJson } = require('../utils/diskCache');

// Public elevation providers can be intermittent, so keep the order configurable.
const OPEN_ELEVATION_API = 'https://api.open-elevation.com/api/v1/lookup';
const OPEN_METEO_ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const MAX_PROFILE_POINTS = Number(process.env.ELEVATION_MAX_POINTS || 120);
const BATCH_SIZE = Number(process.env.ELEVATION_BATCH_SIZE || 60);
const OPEN_METEO_BATCH_SIZE = Number(process.env.ELEVATION_OPEN_METEO_BATCH_SIZE || 50);
const MAX_RETRIES = Number(process.env.ELEVATION_MAX_RETRIES || 3);
const BASE_RETRY_DELAY_MS = Number(process.env.ELEVATION_RETRY_DELAY_MS || 400);
const REQUEST_TIMEOUT_MS = Number(process.env.ELEVATION_TIMEOUT_MS || 15000);
const CACHE_TTL_MS = Number(process.env.ELEVATION_CACHE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const PROVIDER_ORDER = (process.env.ELEVATION_PROVIDER_ORDER || 'open-meteo,open-elevation')
  .split(',')
  .map(provider => provider.trim())
  .filter(Boolean);

const PROVIDERS = {
  'open-elevation': fetchFromOpenElevation,
  'open-meteo': fetchFromOpenMeteo
};

const elevationCache = new Map();

/**
 * Get elevation profile for route coordinates
 * Uses public elevation providers with retries and fallback.
 */
async function getElevationProfile(coordinates) {
  try {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('Invalid coordinates payload');
    }

    const sampledCoordinates = downsampleCoordinates(coordinates, MAX_PROFILE_POINTS);
    const cacheKey = buildCacheKey(sampledCoordinates);
    const cached = elevationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const diskCached = await getCachedJson('elevation', cacheKey, CACHE_TTL_MS);
    if (diskCached) {
      elevationCache.set(cacheKey, diskCached);
      return diskCached;
    }

    const elevationData = await fetchFromProviders(sampledCoordinates);

    if (!elevationData.length) {
      throw new Error('No elevation points returned by providers');
    }

    // Calculate elevation statistics
    const elevations = elevationData.map(d => d.elevation);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const totalGain = calculateElevationGain(elevations, 'up');
    const totalLoss = calculateElevationGain(elevations, 'down');

    const result = {
      points: elevationData.map((d, i) => ({
        lat: d.latitude,
        lon: d.longitude,
        elevation: d.elevation,
        distance: i > 0 ? getDistanceFromLatLon(
          sampledCoordinates[i - 1][0], sampledCoordinates[i - 1][1],
          sampledCoordinates[i][0], sampledCoordinates[i][1]
        ) : 0
      })),
      stats: {
        minElevation,
        maxElevation,
        totalGain,
        totalLoss,
        elevationRange: maxElevation - minElevation,
        avgGradient: calculateAvgGradient(sampledCoordinates, elevations)
      },
      timestamp: new Date().toISOString()
    };

    elevationCache.set(cacheKey, result);
    await setCachedJson('elevation', cacheKey, result);
    trimCache(elevationCache, 100);

    return result;
  } catch (error) {
    console.error('Elevation API error:', error.message);
    throw new Error(`Could not fetch elevation data: ${error.message}`);
  }
}

async function fetchFromProviders(coordinates) {
  const errors = [];

  for (const providerName of PROVIDER_ORDER) {
    const provider = PROVIDERS[providerName];
    if (!provider) {
      errors.push(`${providerName}: unknown provider`);
      continue;
    }

    try {
      const elevationData = await provider(coordinates);
      return elevationData.map(point => ({ ...point, provider: providerName }));
    } catch (error) {
      const message = formatProviderError(error);
      console.warn(`Elevation provider ${providerName} failed: ${message}`);
      errors.push(`${providerName}: ${message}`);
    }
  }

  throw new Error(`All elevation providers failed (${errors.join('; ')})`);
}

async function fetchFromOpenElevation(coordinates) {
  const elevationData = [];

  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    const batch = coordinates.slice(i, i + BATCH_SIZE);
    const locations = batch.map((coord) => ({
      latitude: coord[0],
      longitude: coord[1]
    }));

    const response = await postWithRetry(OPEN_ELEVATION_API, { locations });
    if (response.data && Array.isArray(response.data.results)) {
      elevationData.push(...response.data.results);
    }
  }

  return elevationData;
}

async function fetchFromOpenMeteo(coordinates) {
  const elevationData = [];

  for (let i = 0; i < coordinates.length; i += OPEN_METEO_BATCH_SIZE) {
    const batch = coordinates.slice(i, i + OPEN_METEO_BATCH_SIZE);
    const latitudes = batch.map((coord) => roundCoordinate(coord[0])).join(',');
    const longitudes = batch.map((coord) => roundCoordinate(coord[1])).join(',');

    const response = await axios.get(OPEN_METEO_ELEVATION_API, {
      params: {
        latitude: latitudes,
        longitude: longitudes
      },
      timeout: REQUEST_TIMEOUT_MS
    });

    const elevations = response.data && Array.isArray(response.data.elevation)
      ? response.data.elevation
      : [];

    if (elevations.length !== batch.length) {
      throw new Error(`Open-Meteo returned ${elevations.length} elevations for ${batch.length} coordinates`);
    }

    elevationData.push(...batch.map((coord, idx) => ({
      latitude: coord[0],
      longitude: coord[1],
      elevation: Number(elevations[idx] ?? 0)
    })));
  }

  return elevationData;
}

async function postWithRetry(url, payload) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await axios.post(url, payload, { timeout: REQUEST_TIMEOUT_MS });
    } catch (error) {
      if (attempt === MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }

      const retryAfterHeader = error.response && error.response.headers
        ? Number(error.response.headers['retry-after'])
        : 0;
      const retryAfterMs = retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : BASE_RETRY_DELAY_MS * (attempt + 1);

      await sleep(retryAfterMs);
    }
  }

  throw new Error('Unreachable retry state');
}

function downsampleCoordinates(coordinates, maxPoints) {
  if (coordinates.length <= maxPoints) {
    return coordinates;
  }

  const sampled = [coordinates[0]];
  const step = (coordinates.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    sampled.push(coordinates[idx]);
  }

  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

function buildCacheKey(coordinates) {
  const head = coordinates[0];
  const tail = coordinates[coordinates.length - 1];
  return `${coordinates.length}:${head[0].toFixed(5)},${head[1].toFixed(5)}:${tail[0].toFixed(5)},${tail[1].toFixed(5)}`;
}

function roundCoordinate(value) {
  return Number(value).toFixed(5);
}

function trimCache(cache, maxSize) {
  if (cache.size <= maxSize) {
    return;
  }
  const keys = cache.keys();
  while (cache.size > maxSize) {
    const nextKey = keys.next();
    if (nextKey.done) {
      break;
    }
    cache.delete(nextKey.value);
  }
}

function isRetryableError(error) {
  if (isTimeoutError(error)) {
    return false;
  }

  const status = error.response ? error.response.status : 0;
  return status === 429 || (status >= 500 && status < 600) || !status;
}

function isTimeoutError(error) {
  return error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
}

function formatProviderError(error) {
  if (error.response) {
    return `HTTP ${error.response.status}`;
  }

  return error.message || 'unknown error';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate total elevation gain or loss
 */
function calculateElevationGain(elevations, direction = 'up') {
  let total = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if ((direction === 'up' && diff > 0) || (direction === 'down' && diff < 0)) {
      total += Math.abs(diff);
    }
  }
  return Math.round(total);
}

/**
 * Calculate average gradient using Haversine distance
 */
function calculateAvgGradient(coordinates, elevations) {
  let totalDistance = 0;
  let totalElevationGain = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const dist = getDistanceFromLatLon(
      coordinates[i-1][0], coordinates[i-1][1],
      coordinates[i][0], coordinates[i][1]
    );
    const elevGain = Math.max(0, elevations[i] - elevations[i-1]);

    totalDistance += dist;
    totalElevationGain += elevGain;
  }

  return totalDistance > 0 ? ((totalElevationGain / totalDistance) * 100).toFixed(2) : 0;
}

/**
 * Haversine formula to calculate distance between coordinates in km
 */
function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  getElevationProfile,
  calculateElevationGain,
  calculateAvgGradient
};
