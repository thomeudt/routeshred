const axios = require('axios');
const { getCachedJson, setCachedJson } = require('../utils/diskCache');

const inFlightNominatim = new Map();

const NOMINATIM_API = process.env.NOMINATIM_API || 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'RouteShred/0.1 (+https://github.com/routeshred/routeshred)';
const OVERPASS_API = process.env.OVERPASS_API || 'https://overpass-api.de/api/interpreter';
const GEOAPIFY_PLACES_API = process.env.GEOAPIFY_PLACES_API || 'https://api.geoapify.com/v2/places';
const GEOAPIFY_API_KEY = String(process.env.GEOAPIFY_API_KEY || '').trim();
const GEOCODING_CACHE_TTL_MS = Number(process.env.GEOCODING_CACHE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const GEOCODING_TIMEOUT_MS = Number(process.env.GEOCODING_TIMEOUT_MS || 10000);
const POI_SEARCH_RADIUS_M = Number(process.env.GEOCODING_POI_RADIUS_M || 45000);
const POI_PROVIDER = String(
  process.env.POI_PROVIDER || (GEOAPIFY_API_KEY ? 'geoapify' : 'overpass')
).trim().toLowerCase();

async function searchPlacesQuick(query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const limit = clamp(Number(options.limit) || 6, 1, 10);
  const language = String(options.language || 'de').slice(0, 8);

  // Serve from full cache when available — no need to fetch again
  const fullCacheKey = { query: normalizedQuery.toLowerCase(), limit, language };
  const fullCached = await getCachedJson('geocoding', fullCacheKey, GEOCODING_CACHE_TTL_MS);
  if (Array.isArray(fullCached)) {
    return fullCached;
  }

  const quickCacheKey = { query: normalizedQuery.toLowerCase(), limit, language, quick: true };
  const quickCached = await getCachedJson('geocoding', quickCacheKey, GEOCODING_CACHE_TTL_MS);
  if (Array.isArray(quickCached)) {
    return quickCached;
  }

  const places = await searchNominatimPlaces(normalizedQuery, { language, limit: clamp(limit * 2, 2, 20) });
  const result = dedupePlaces(places, limit);
  await setCachedJson('geocoding', quickCacheKey, result);
  return result;
}

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

  // Reuse quick cache if available — avoids a second Nominatim call when quick already ran
  const quickCacheKey = { query: normalizedQuery.toLowerCase(), limit, language, quick: true };
  const quickCached = await getCachedJson('geocoding', quickCacheKey, GEOCODING_CACHE_TTL_MS);
  const nominatimPlaces = Array.isArray(quickCached)
    ? quickCached
    : await searchNominatimPlaces(normalizedQuery, { language, limit: clamp(limit * 2, 2, 20) });

  const intent = detectPoiIntent(normalizedQuery);
  const focusPoint = (nominatimPlaces[0] && nominatimPlaces[0].point) || null;

  const poiPlaces = focusPoint
    ? await searchPoiPlaces(normalizedQuery, { limit: clamp(limit * 2, 2, 20), language, focusPoint, intent })
    : [];

  let places = dedupePlaces([...poiPlaces, ...nominatimPlaces], limit);
  if (!places.length && intent.category !== 'generic' && intent.locationQuery) {
    const fallbackQuery = `${getCategoryFallbackToken(intent.category)} ${intent.locationQuery}`.trim();
    const categoryFallback = await searchNominatimPlaces(fallbackQuery, {
      language,
      limit: clamp(limit * 2, 2, 20)
    });
    places = dedupePlaces(categoryFallback, limit);
  }

  await setCachedJson('geocoding', cacheKey, places);
  return places;
}

async function searchNominatimPlaces(query, options = {}) {
  const key = `${String(query).toLowerCase()}:${String(options.language || 'de')}:${clamp(Number(options.limit) || 8, 1, 20)}`;
  if (inFlightNominatim.has(key)) {
    return inFlightNominatim.get(key);
  }
  const promise = _fetchNominatimPlaces(query, options).finally(() => inFlightNominatim.delete(key));
  inFlightNominatim.set(key, promise);
  return promise;
}

async function _fetchNominatimPlaces(query, options = {}) {
  const response = await axios.get(NOMINATIM_API, {
    params: {
      q: String(query || '').trim(),
      format: 'jsonv2',
      addressdetails: 1,
      namedetails: 1,
      limit: clamp(Number(options.limit) || 8, 1, 20)
    },
    headers: {
      Accept: 'application/json',
      'Accept-Language': String(options.language || 'de').slice(0, 8),
      'User-Agent': NOMINATIM_USER_AGENT
    },
    timeout: GEOCODING_TIMEOUT_MS
  });

  return Array.isArray(response.data)
    ? response.data.map(normalizeNominatimPlace).filter(Boolean)
    : [];
}

async function searchPoiPlaces(query, options = {}) {
  const provider = POI_PROVIDER;
  if (provider === 'geoapify') {
    const geoapifyResults = await searchPoiPlacesGeoapify(query, options);
    if (geoapifyResults.length) {
      return geoapifyResults;
    }
    return searchPoiPlacesOverpass(query, options);
  }

  return searchPoiPlacesOverpass(query, options);
}

async function searchPoiPlacesGeoapify(query, options = {}) {
  if (!GEOAPIFY_API_KEY) {
    return [];
  }

  const limit = clamp(Number(options.limit) || 12, 1, 24);
  const [lat, lon] = Array.isArray(options.focusPoint) ? options.focusPoint : [NaN, NaN];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [];
  }

  const intent = options.intent || detectPoiIntent(query);
  const categories = getGeoapifyCategories(intent.category);
  const params = {
    categories,
    filter: `circle:${lon},${lat},${POI_SEARCH_RADIUS_M}`,
    bias: `proximity:${lon},${lat}`,
    limit,
    lang: String(options.language || 'de').slice(0, 8),
    apiKey: GEOAPIFY_API_KEY
  };

  if (intent.category === 'generic' && intent.nameTokens && intent.nameTokens.length) {
    params.name = intent.nameTokens.slice(0, 3).join(' ');
  }

  try {
    const response = await axios.get(GEOAPIFY_PLACES_API, {
      params,
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT
      },
      timeout: GEOCODING_TIMEOUT_MS
    });

    const features = Array.isArray(response.data && response.data.features)
      ? response.data.features
      : [];

    return features
      .map(normalizeGeoapifyPlace)
      .filter(Boolean)
      .sort((a, b) => scorePoiType(b.type, intent.category) - scorePoiType(a.type, intent.category))
      .slice(0, limit);
  } catch (_error) {
    return [];
  }
}

async function searchPoiPlacesOverpass(query, options = {}) {
  const limit = clamp(Number(options.limit) || 12, 1, 24);
  const [lat, lon] = Array.isArray(options.focusPoint) ? options.focusPoint : [NaN, NaN];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [];
  }

  const intent = options.intent || detectPoiIntent(query);
  const filters = getOverpassCategoryFilters(intent.category);
  const nameRegex = intent.category === 'generic'
    ? buildNameRegex(intent.nameTokens)
    : '';

  const queryLines = [];
  const targetFilters = filters.length ? filters : ['[~"^(amenity|shop|tourism|leisure|office)$"~".+"]'];
  targetFilters.forEach((filter) => {
    const namePart = nameRegex ? `[name~"${nameRegex}",i]` : '';
    queryLines.push(`  node(around:${POI_SEARCH_RADIUS_M},${lat},${lon})${filter}${namePart};`);
    queryLines.push(`  way(around:${POI_SEARCH_RADIUS_M},${lat},${lon})${filter}${namePart};`);
    queryLines.push(`  relation(around:${POI_SEARCH_RADIUS_M},${lat},${lon})${filter}${namePart};`);
  });

  const overpassQuery = [
    '[out:json][timeout:12];',
    '(',
    ...queryLines,
    ');',
    `out center tags ${limit * 2};`
  ].join('\n');

  try {
    const response = await axios.post(OVERPASS_API, overpassQuery, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Accept: 'application/json',
        'Accept-Language': String(options.language || 'de').slice(0, 8),
        'User-Agent': NOMINATIM_USER_AGENT
      },
      timeout: GEOCODING_TIMEOUT_MS
    });

    const elements = Array.isArray(response.data && response.data.elements)
      ? response.data.elements
      : [];

    return elements
      .map(normalizeOverpassPlace)
      .filter(Boolean)
      .sort((a, b) => scorePoiType(b.type, intent.category) - scorePoiType(a.type, intent.category))
      .slice(0, limit);
  } catch (_error) {
    // Overpass can rate-limit or timeout; fallback to Nominatim-only results.
    return [];
  }
}

function normalizeGeoapifyPlace(feature) {
  const properties = feature && feature.properties ? feature.properties : {};
  const geometry = feature && feature.geometry ? feature.geometry : {};
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const name = String(properties.name || properties.address_line1 || properties.formatted || '').trim();
  if (!name) {
    return null;
  }

  const secondary = String(properties.address_line2 || '').trim();
  const categoryLabel = geoapifyCategoryToType(properties.categories);

  return {
    id: `geoapify-${String(properties.place_id || `${lat},${lon}`)}`,
    label: secondary ? `${name}, ${secondary}` : name,
    point: [lat, lon],
    type: categoryLabel
  };
}

function normalizeNominatimPlace(place) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const primaryLabel = String(
    (place.namedetails && place.namedetails.name)
    || place.name
    || place.display_name
    || ''
  ).trim();
  const addressLabel = formatNominatimAddress(place.address || {});

  return {
    id: `nominatim-${String(place.place_id || `${lat},${lon}`)}`,
    label: addressLabel && primaryLabel
      ? `${primaryLabel}, ${addressLabel}`
      : (primaryLabel || place.display_name),
    point: [lat, lon],
    type: humanizePlaceType(place.class, place.type)
  };
}

function normalizeOverpassPlace(element) {
  const tags = element && element.tags ? element.tags : {};
  const lat = Number(element && (element.lat || (element.center && element.center.lat)));
  const lon = Number(element && (element.lon || (element.center && element.center.lon)));
  const name = String(tags.name || tags.brand || '').trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !name) {
    return null;
  }

  const address = formatTagAddress(tags);
  return {
    id: `overpass-${element.type || 'node'}-${String(element.id || `${lat},${lon}`)}`,
    label: address ? `${name}, ${address}` : name,
    point: [lat, lon],
    type: classifyPoi(tags)
  };
}

function dedupePlaces(places, limit) {
  const seen = new Set();
  const unique = [];

  for (const place of places) {
    if (!place || !Array.isArray(place.point)) {
      continue;
    }
    const key = `${place.point[0].toFixed(5)},${place.point[1].toFixed(5)}:${String(place.label || '').toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(place);
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

function formatNominatimAddress(address = {}) {
  const street = String(address.road || address.pedestrian || address.cycleway || address.footway || '').trim();
  const number = String(address.house_number || '').trim();
  const city = String(address.city || address.town || address.village || address.suburb || '').trim();

  const streetLine = [street, number].filter(Boolean).join(' ').trim();
  return [streetLine, city].filter(Boolean).join(', ');
}

function formatTagAddress(tags = {}) {
  const street = String(tags['addr:street'] || '').trim();
  const number = String(tags['addr:housenumber'] || '').trim();
  const city = String(tags['addr:city'] || '').trim();
  const streetLine = [street, number].filter(Boolean).join(' ').trim();
  return [streetLine, city].filter(Boolean).join(', ');
}

function classifyPoi(tags = {}) {
  if (tags.tourism === 'hotel' || tags.tourism === 'guest_house' || tags.tourism === 'hostel') {
    return 'Hotel';
  }
  if (tags.shop) {
    return `Shop (${titleCaseToken(tags.shop)})`;
  }
  if (tags.amenity) {
    return `POI (${titleCaseToken(tags.amenity)})`;
  }
  if (tags.tourism) {
    return `POI (${titleCaseToken(tags.tourism)})`;
  }
  if (tags.leisure) {
    return `POI (${titleCaseToken(tags.leisure)})`;
  }
  return 'POI';
}

function detectPoiIntent(query) {
  const normalized = String(query || '').toLowerCase().trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);

  let category = 'generic';
  if (/(bike\s*shop|fahrrad\s*laden|fahrradshop|bicycle\s*shop)/i.test(normalized)) {
    category = 'bike';
  } else if (/(hotel|hostel|guest\s*house|pension)/i.test(normalized)) {
    category = 'hotel';
  } else if (/(cafe|kaffee|coffee|restaurant|bistro|bar|pub|food)/i.test(normalized)) {
    category = 'cafe';
  } else if (/(shop|store|geschaeft|geschäft|laden|supermarkt|markt)/i.test(normalized)) {
    category = 'shop';
  }

  const stopWords = new Set([
    'hotel', 'hostel', 'guesthouse', 'guest', 'house', 'pension',
    'shop', 'store', 'laden', 'geschaeft', 'geschäft', 'supermarkt', 'markt',
    'bike', 'bicycle', 'fahrrad', 'fahrradladen', 'fahrradshop',
    'cafe', 'coffee', 'kaffee', 'restaurant', 'bistro', 'bar', 'pub', 'food',
    'poi'
  ]);

  const nameTokens = tokens.filter((token) => token.length > 2);
  const locationTokens = tokens.filter((token) => token.length > 2 && !stopWords.has(token));

  return {
    category,
    nameTokens,
    locationQuery: locationTokens.join(' ').trim() || normalized
  };
}

function getOverpassCategoryFilters(category) {
  switch (category) {
    case 'bike':
      return [
        '[shop="bicycle"]',
        '[amenity~"^(bicycle_rental|bicycle_repair_station)$"]'
      ];
    case 'hotel':
      return [
        '[tourism~"^(hotel|guest_house|hostel|motel|apartment)$"]',
        '[amenity~"^(hotel)$"]'
      ];
    case 'cafe':
      return ['[amenity~"^(cafe|restaurant|fast_food|bar|pub|biergarten)$"]'];
    case 'shop':
      return ['[shop~".+"]'];
    default:
      return [];
  }
}

function getCategoryFallbackToken(category) {
  switch (category) {
    case 'bike':
      return 'fahrradladen';
    case 'hotel':
      return 'hotel';
    case 'cafe':
      return 'cafe';
    case 'shop':
      return 'shop';
    default:
      return '';
  }
}

function getGeoapifyCategories(category) {
  switch (category) {
    case 'bike':
      return 'commercial.bicycle,sport';
    case 'hotel':
      return 'accommodation.hotel,accommodation.hostel,accommodation.guest_house,accommodation.motel';
    case 'cafe':
      return 'catering.cafe,catering.restaurant,catering.fast_food,catering.pub,catering.bar';
    case 'shop':
      return 'commercial';
    default:
      return 'accommodation,catering,commercial,tourism,leisure';
  }
}

function geoapifyCategoryToType(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const joined = list.join(',').toLowerCase();
  if (joined.includes('accommodation.hotel') || joined.includes('hotel')) {
    return 'Hotel';
  }
  if (joined.includes('commercial.bicycle') || joined.includes('bicycle')) {
    return 'Shop (Bicycle)';
  }
  if (joined.includes('commercial')) {
    return 'Shop';
  }
  if (joined.includes('catering.cafe')) {
    return 'POI (Cafe)';
  }
  if (joined.includes('catering.restaurant')) {
    return 'POI (Restaurant)';
  }
  return 'POI';
}

function buildNameRegex(tokens = []) {
  const filtered = Array.isArray(tokens)
    ? tokens.filter((token) => String(token || '').trim().length >= 3).slice(0, 4)
    : [];
  if (!filtered.length) {
    return '';
  }
  return filtered.map((token) => escapeOverpassRegex(token)).join('|');
}

function scorePoiType(typeLabel, category) {
  const type = String(typeLabel || '').toLowerCase();
  if (!category || category === 'generic') {
    return 1;
  }
  if (category === 'hotel' && type.includes('hotel')) {
    return 5;
  }
  if (category === 'bike' && type.includes('shop (bicycle)')) {
    return 5;
  }
  if (category === 'shop' && type.startsWith('shop')) {
    return 4;
  }
  if (category === 'cafe' && (type.includes('cafe') || type.includes('restaurant') || type.includes('bar') || type.includes('pub'))) {
    return 4;
  }
  return 1;
}

function humanizePlaceType(osmClass, osmType) {
  const cls = String(osmClass || '').toLowerCase();
  const typ = String(osmType || '').toLowerCase();

  if (cls === 'tourism' && (typ === 'hotel' || typ === 'guest_house' || typ === 'hostel')) {
    return 'Hotel';
  }
  if (cls === 'shop') {
    return `Shop (${titleCaseToken(typ)})`;
  }
  if (cls === 'amenity') {
    return `POI (${titleCaseToken(typ)})`;
  }
  if (cls || typ) {
    return `${titleCaseToken(cls || 'place')} (${titleCaseToken(typ || cls)})`;
  }
  return 'Place';
}

function escapeOverpassRegex(value) {
  return String(value || '').replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
}

function titleCaseToken(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  searchPlaces,
  searchPlacesQuick
};
