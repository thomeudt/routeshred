const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const { getCachedJson, setCachedJson } = require('../utils/diskCache');

// Routing profiles compatible with public OSRM demo.
const PROFILES = {
  road: 'cycling',
  gravel: 'cycling',
  mtb: 'cycling'
};

const PREFERENCE_PROFILES = {
  fastest: 'fastest',
  scenic: 'shortest',
  offroad: 'shortest'
};

// OSRM Demo Server (for development - replace with self-hosted for production)
const OSRM_API = process.env.OSRM_API || 'http://router.project-osrm.org';
const OVERPASS_API = process.env.OVERPASS_API || 'https://overpass-api.de/api/interpreter';
const ROUTING_ENGINE = (process.env.ROUTING_ENGINE || 'osrm').toLowerCase();
const BROUTER_API = process.env.BROUTER_API || 'http://localhost:17777/brouter';
const BROUTER_CUSTOM_PROFILES_DIR = process.env.BROUTER_CUSTOM_PROFILES_DIR
  || path.resolve(__dirname, '../../../brouter-data/customprofiles');
const BROUTER_SEGMENTS_DIR = process.env.BROUTER_SEGMENTS_DIR
  || path.resolve(__dirname, '../../../brouter-data/segments4');
const BROUTER_SEGMENTS_BASE_URL = process.env.BROUTER_SEGMENTS_BASE_URL
  || 'https://brouter.de/brouter/segments4';
const BROUTER_AUTO_FETCH_SEGMENTS = String(process.env.BROUTER_AUTO_FETCH_SEGMENTS || 'true') !== 'false';
const DEBUG_OPTIONAL_LOOKUPS = String(process.env.DEBUG_OPTIONAL_LOOKUPS || 'false') === 'true';
const OVERPASS_CACHE_TTL_MS = Number(process.env.OVERPASS_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const downloadedSegmentTiles = new Set();

/**
 * Get optimal route using OSRM
 * In production, use a self-hosted OSRM instance with OpenCycleMap OSM data
 */
async function getRoute(start, end, options = {}) {
  const {
    bikeType = 'road',
    preference = 'scenic',
    rideType = 'z2',
    waypoints = [],
    riderProfile = {}
  } = options;
  const ftp = Number(riderProfile.ftp) > 0 ? Number(riderProfile.ftp) : 250;
  const profile = PROFILES[bikeType] || 'cycling';
  const routePoints = [start, ...normalizeWaypoints(waypoints), end];

  try {
    const baseRouteResponse = await requestRoute(profile, routePoints, {
      alternatives: true,
      continue_straight: preference === 'fastest',
      bikeType,
      preference
    });

    const baseCandidates = baseRouteResponse.routes || [];
    if (!baseCandidates.length) {
      throw new Error('No route found');
    }

    // Map rideType to effective preference for route scoring.
    const effectivePreference = mapRideTypeToPreference(rideType, preference);

    // Optional cycleway orientation for scenic/offroad preferences.
    let guidedRoute = null;
    if (effectivePreference === 'scenic' || effectivePreference === 'offroad') {
      const viaPoints = await findPreferenceWaypoints(start, end, bikeType, preference);
      for (const viaPoint of viaPoints) {
        try {
          const guidedResponse = await requestRoute(profile, [start, ...normalizeWaypoints(waypoints), viaPoint, end], {
            alternatives: false,
            continue_straight: false,
            bikeType,
            preference: effectivePreference,
            rideType
          });

          if (guidedResponse.routes && guidedResponse.routes.length) {
            guidedRoute = guidedResponse.routes[0];
            break;
          }
        } catch (guidedError) {
          // Continue with next candidate waypoint.
        }
      }
    }

    let selected = pickPreferredRoute(baseCandidates, guidedRoute, effectivePreference, rideType);

    // Active preference of OSM cycle infrastructure in corridor between start/end.
    const cycleRanked = await selectByCyclewayAffinity(
      baseCandidates,
      guidedRoute,
      start,
      end,
      bikeType,
      effectivePreference,
      rideType
    );

    if (cycleRanked) {
      selected = cycleRanked;
    }

    if (!selected) {
      throw new Error('No route found after preference selection');
    }

    const route = selected.route;

    return {
      geometry: route.geometry,
      distance: route.distance, // meters
      duration: route.duration, // seconds
      ascent: route.ascent || 0,   // meters total elevation gain
      descent: route.descent || 0,
      legs: route.legs,
      startPoint: start,
      endPoint: end,
      waypoints: normalizeWaypoints(waypoints),
      bikeType,
      preference,
      rideType,
      strategy: selected.strategy,
      engineUsed: String(route._engine || ROUTING_ENGINE).toUpperCase(),
      fallbackUsed: Boolean(route._fallbackFrom),
      fallbackFrom: route._fallbackFrom ? String(route._fallbackFrom).toUpperCase() : null,
      powerZone: computePowerZone(rideType, ftp, route.duration),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('OSRM routing error:', error.message);
    throw new Error(`Routing failed: ${error.message}`);
  }
}

async function getBikeProfiles() {
  try {
    const entries = await fs.readdir(BROUTER_CUSTOM_PROFILES_DIR, { withFileTypes: true });
    const profiles = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.brf')) {
        continue;
      }

      const id = entry.name.replace(/\.brf$/i, '');
      const filePath = path.join(BROUTER_CUSTOM_PROFILES_DIR, entry.name);
      profiles.push({
        id,
        label: await readBrouterProfileLabel(filePath, id),
        kind: inferBikeKind(id),
        source: 'brouter'
      });
    }

    if (profiles.length) {
      return profiles.sort((a, b) => a.label.localeCompare(b.label));
    }
  } catch (error) {
    console.warn('Could not load BRouter custom profiles:', error.message);
  }

  return [
    { id: 'road', label: 'Road', kind: 'road', source: 'fallback' },
    { id: 'gravel', label: 'Gravel', kind: 'gravel', source: 'fallback' },
    { id: 'mtb', label: 'MTB', kind: 'mtb', source: 'fallback' }
  ];
}

async function readBrouterProfileLabel(filePath, id) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const firstComment = content
      .split('\n')
      .map(line => line.replace(/^#\s*/, '').trim())
      .find(line => line && !line.endsWith('.brf'));

    if (firstComment) {
      const match = firstComment.match(/for (?:a |an )?(.+?)(?: bike|\.|$)/i);
      if (match && match[1]) {
        return titleCaseProfile(match[1]);
      }
    }
  } catch (_) {
    // Fall through to filename label.
  }

  return titleCaseProfile(id.replace(/-/g, ' '));
}

function titleCaseProfile(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => {
      const lower = part.toLowerCase();
      if (lower === '3t' || lower === 'mtb') {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Ride-type helpers
// ---------------------------------------------------------------------------

/**
 * Map ride type + user preference to the internal routing preference used for
 * Overpass-guided waypoints and route scoring.
 */
function mapRideTypeToPreference(rideType, userPreference) {
  switch (rideType) {
    case 'tt':        return 'fastest';
    case 'z2':        return 'scenic';
    case 'sst':       return 'scenic';
    case 'threshold': return 'offroad'; // triggers hillier alternatives
    default:          return userPreference || 'scenic';
  }
}

function normalizeWaypoints(waypoints) {
  return Array.isArray(waypoints)
    ? waypoints.filter((point) => (
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    )).map((point) => [Number(point[0]), Number(point[1])])
    : [];
}

/**
 * Compute power zone targets and estimated training load for a route.
 * Uses classic Coggan zones based on % FTP.
 */
function computePowerZone(rideType, ftp, durationSeconds) {
  const ZONES = {
    z2: {
      label: 'Zone 2 — Endurance',
      minPct: 0.56, targetPct: 0.66, maxPct: 0.75,
      color: '#3b82f6'
    },
    sst: {
      label: 'Sweet Spot',
      minPct: 0.88, targetPct: 0.91, maxPct: 0.93,
      color: '#f59e0b'
    },
    tt: {
      label: 'Time Trial — FTP',
      minPct: 0.91, targetPct: 1.00, maxPct: 1.05,
      color: '#ef4444'
    },
    threshold: {
      label: 'Threshold Intervals',
      minPct: 0.95, targetPct: 1.02, maxPct: 1.05,
      color: '#dc2626'
    }
  };

  const zone = ZONES[rideType] || ZONES.z2;
  const minW    = Math.round(ftp * zone.minPct);
  const targetW = Math.round(ftp * zone.targetPct);
  const maxW    = Math.round(ftp * zone.maxPct);

  // Energy (kJ) = avg_watts * duration_s / 1000
  const estimatedKj = Math.round(targetW * durationSeconds / 1000);

  // TSS = (duration_s * NP * IF) / (FTP * 3600) * 100
  // For constant-power estimate: NP ≈ target, IF = target/FTP
  const intensityFactor = targetW / ftp;
  const estimatedTss = Math.round(
    (durationSeconds * targetW * intensityFactor) / (ftp * 3600) * 100
  );

  return {
    type: rideType,
    label: zone.label,
    color: zone.color,
    minWatts: minW,
    targetWatts: targetW,
    maxWatts: maxW,
    estimatedKj,
    estimatedTss
  };
}

async function requestRoute(profile, points, options = {}) {
  let fellBackFromBrouter = false;

  if (ROUTING_ENGINE === 'brouter') {
    try {
      return await requestRouteBrouter(points, options);
    } catch (error) {
      // Keep the app usable if local BRouter is not available.
      console.warn(`BRouter unavailable, falling back to OSRM: ${error.message}`);
      fellBackFromBrouter = true;
    }
  }

  const coordinates = points.map((p) => `${p[1]},${p[0]}`).join(';');
  const response = await axios.get(`${OSRM_API}/route/v1/${profile}/${coordinates}`, {
    params: {
      overview: 'full',
      steps: true,
      geometries: 'geojson',
      annotations: 'duration,distance,speed',
      alternatives: options.alternatives ? 3 : false,
      continue_straight: options.continue_straight ? true : false
    },
    timeout: 15000
  });

  const data = response.data || {};
  data.routes = Array.isArray(data.routes)
    ? data.routes.map((route) => ({
      ...route,
      _engine: 'osrm',
      _fallbackFrom: fellBackFromBrouter ? 'brouter' : null
    }))
    : [];

  return data;
}

function getRoutingEngineInfo() {
  return {
    configuredEngine: ROUTING_ENGINE,
    osrmApi: OSRM_API,
    brouterApi: BROUTER_API
  };
}

async function requestRouteBrouter(points, options = {}) {
  await ensureBrouterSegments(points);

  const alternatives = options.alternatives ? [0, 1, 2] : [0];
  const routes = [];

  for (const alternativeidx of alternatives) {
    try {
      const response = await axios.get(BROUTER_API, {
        params: {
          lonlats: points.map((p) => `${p[1]},${p[0]}`).join('|'),
          profile: resolveBrouterProfile(options),
          alternativeidx,
          format: 'geojson'
        },
        timeout: 25000
      });

      const feature = response.data && Array.isArray(response.data.features)
        ? response.data.features[0]
        : null;
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
        continue;
      }

      routes.push(normalizeBrouterFeature(feature));
    } catch (error) {
      // Try next alternative candidate.
    }
  }

  if (!routes.length) {
    throw new Error('BRouter returned no route');
  }

  return { routes };
}

async function ensureBrouterSegments(points) {
  if (!BROUTER_AUTO_FETCH_SEGMENTS) {
    return;
  }

  // Only auto-fetch for local BRouter setups to avoid touching remote servers.
  if (!/localhost|127\.0\.0\.1|host\.docker\.internal/i.test(BROUTER_API)) {
    return;
  }

  try {
    await fs.mkdir(BROUTER_SEGMENTS_DIR, { recursive: true });
  } catch (error) {
    console.warn('Could not create BRouter segments directory:', error.message);
    return;
  }

  const tiles = collectSegmentTiles(points);
  for (const tile of tiles) {
    if (downloadedSegmentTiles.has(tile)) {
      continue;
    }

    const targetPath = path.join(BROUTER_SEGMENTS_DIR, tile);
    const exists = await fileExists(targetPath);
    if (exists) {
      downloadedSegmentTiles.add(tile);
      continue;
    }

    try {
      const url = `${BROUTER_SEGMENTS_BASE_URL}/${tile}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000
      });
      await fs.writeFile(targetPath, response.data);
      downloadedSegmentTiles.add(tile);
    } catch (error) {
      // Missing neighboring tiles are normal for water/coastline and should not fail routing.
      if (error.response && error.response.status === 404) {
        continue;
      }
      console.warn(`BRouter segment fetch failed for ${tile}:`, error.message);
    }
  }
}

function collectSegmentTiles(points) {
  const tiles = new Set();
  const steps = [-5, 0, 5];

  for (const p of points) {
    const lat = Number(p[0]);
    const lon = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const baseLat = Math.floor(lat / 5) * 5;
    const baseLon = Math.floor(lon / 5) * 5;

    for (const latDelta of steps) {
      for (const lonDelta of steps) {
        const latTile = baseLat + latDelta;
        const lonTile = baseLon + lonDelta;
        const latPart = `${latTile >= 0 ? 'N' : 'S'}${Math.abs(latTile)}`;
        const lonPart = `${lonTile >= 0 ? 'E' : 'W'}${Math.abs(lonTile)}`;
        tiles.add(`${lonPart}_${latPart}.rd5`);
      }
    }
  }

  return tiles;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveBrouterProfile(options = {}) {
  const bikeType  = options.bikeType  || 'road';
  const rideType  = options.rideType  || 'z2';
  const preference = options.preference || (options.continue_straight ? 'fastest' : 'scenic');
  const legacyProfile = PROFILES[bikeType];

  if (!legacyProfile) {
    return bikeType;
  }

  // MTB stays on the mtb profile regardless.
  if (preference === 'offroad' || bikeType === 'mtb') {
    return 'mtb';
  }

  // Use custom per-bike profiles when available.
  if (bikeType === 'road') {
    return 'pinarello-dogma';
  }

  if (bikeType === 'gravel') {
    return '3t-racemax';
  }

  // Generic fallback.
  return preference === 'fastest' ? 'fastbike' : 'trekking';
}

function inferBikeKind(profileId) {
  const id = String(profileId || '').toLowerCase();
  if (/mtb|mountain/.test(id)) {
    return 'mtb';
  }
  if (/gravel|racemax|cross|cx|track/.test(id)) {
    return 'gravel';
  }
  return 'road';
}

function getBikeKind(bikeType) {
  if (PROFILES[bikeType]) {
    return bikeType;
  }
  return inferBikeKind(bikeType);
}

function normalizeBrouterFeature(feature) {
  const coordinates = feature.geometry.coordinates;
  const distanceMeters = computePolylineDistanceMeters(coordinates);

  const props = feature.properties || {};
  const rawSeconds = Number(props['total-time']);
  const durationSeconds = Number.isFinite(rawSeconds) && rawSeconds > 0
    ? rawSeconds
    : estimateRideDurationSeconds(distanceMeters);

  // BRouter returns elevation gain as 'filtered ascend' (noise-filtered ascent in meters).
  // 'plain-ascend' is the net altitude change. There is no 'total-descent' property.
  const ascent  = Number(props['filtered ascend']) || 0;
  const descent = 0; // BRouter v1.7.9 does not expose total descent in GeoJSON properties

  return {
    geometry: {
      type: 'LineString',
      coordinates
    },
    distance: Math.round(distanceMeters),
    duration: Math.round(durationSeconds),
    ascent:   Math.round(ascent),
    descent:  Math.round(descent),
    legs: [
      {
        distance: Math.round(distanceMeters),
        duration: Math.round(durationSeconds),
        summary: 'BRouter route',
        steps: []
      }
    ],
    _engine: 'brouter',
    _fallbackFrom: null
  };
}

function computePolylineDistanceMeters(coordinates) {
  let totalKm = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    totalKm += getDistanceFromLatLon(prev[1], prev[0], curr[1], curr[0]);
  }
  return totalKm * 1000;
}

function estimateRideDurationSeconds(distanceMeters) {
  const avgSpeedKmh = 22;
  const hours = (distanceMeters / 1000) / avgSpeedKmh;
  return hours * 3600;
}

async function selectByCyclewayAffinity(baseCandidates, guidedRoute, start, end, bikeType, preference, rideType = 'z2') {
  const routePool = [...baseCandidates];
  if (guidedRoute) {
    routePool.push(guidedRoute);
  }

  if (!routePool.length) {
    return null;
  }

  const networkPoints = await loadCyclewayNetwork(start, end, bikeType, preference);
  if (!networkPoints.length) {
    return null;
  }
  const majorRoadPoints = await loadMajorRoadNetwork(start, end);

  const fastestDistance = Math.min(...routePool.map((r) => r.distance || Number.POSITIVE_INFINITY));
  let best = null;

  for (const route of routePool) {
    const metrics = scoreRouteCycleAffinity(
      route,
      networkPoints,
      majorRoadPoints,
      fastestDistance,
      bikeType,
      preference,
      rideType
    );
    if (!best || metrics.totalScore > best.metrics.totalScore) {
      best = { route, metrics };
    }
  }

  if (!best) {
    return null;
  }

  // Guardrails: for fastest preference do not aggressively detour.
  if (preference === 'fastest' && best.metrics.detourFactor > 1.2) {
    return null;
  }

  if ((preference === 'scenic' || preference === 'offroad') && best.metrics.cycleCoverage < 0.08) {
    return null;
  }

  if ((preference === 'scenic' || preference === 'offroad') && best.metrics.majorRoadCoverage > 0.18) {
    return null;
  }

  return {
    route: best.route,
    strategy: `${preference}-cycleway-priority`
  };
}

async function fetchOverpassElements(cacheNamespace, query, timeout) {
  const cacheKey = {
    api: OVERPASS_API,
    query
  };
  const cached = await getCachedJson(`overpass-${cacheNamespace}`, cacheKey, OVERPASS_CACHE_TTL_MS);
  if (cached && Array.isArray(cached.elements)) {
    return cached.elements;
  }

  const response = await axios.get(OVERPASS_API, {
    params: { data: query },
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RouteShred/0.1 (+local-dev)'
    },
    timeout
  });

  const elements = Array.isArray(response.data && response.data.elements)
    ? response.data.elements
    : [];

  await setCachedJson(`overpass-${cacheNamespace}`, cacheKey, { elements });
  return elements;
}

async function loadMajorRoadNetwork(start, end) {
  const [minLat, maxLat] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
  const [minLon, maxLon] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];
  const latPad = 0.03;
  const lonPad = 0.05;
  const bbox = `${minLat - latPad},${minLon - lonPad},${maxLat + latPad},${maxLon + lonPad}`;

  const query = '[out:json][timeout:18];(way["highway"~"motorway|motorway_link|trunk|trunk_link"](' + bbox + ');way["highway"~"primary|primary_link"]["ref"~"(^|;)B[[:space:]]*[0-9]",i](' + bbox + ');way["ref"~"(^|;)B[[:space:]]*[0-9]",i]["highway"~"primary|primary_link|secondary|secondary_link"](' + bbox + '););out geom;';

  try {
    const elements = await fetchOverpassElements('major-roads', query, 18000);
    const points = [];

    for (const way of elements) {
      if (!Array.isArray(way.geometry) || !way.geometry.length) {
        continue;
      }
      const tags = way.tags || {};
      const roadClass = getMajorRoadClass(tags);
      for (let i = 0; i < way.geometry.length; i += 5) {
        const node = way.geometry[i];
        points.push({ lat: node.lat, lon: node.lon, roadClass, weight: getMajorRoadWeight(roadClass) });
      }
      if (points.length > 3000) {
        break;
      }
    }

    return points;
  } catch (error) {
    logOptionalLookupFailure('Major road network', error);
    return [];
  }
}

async function loadCyclewayNetwork(start, end, bikeType, preference) {
  const bikeKind = getBikeKind(bikeType);
  const [minLat, maxLat] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
  const [minLon, maxLon] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];

  const latPad = 0.03;
  const lonPad = 0.05;
  const bbox = `${minLat - latPad},${minLon - lonPad},${maxLat + latPad},${maxLon + lonPad}`;

  const directKm = getDistanceFromLatLon(start[0], start[1], end[0], end[1]);
  if (directKm > 80) {
    // Avoid huge Overpass pulls for long-distance routes.
    return [];
  }

  let filter;
  if (preference === 'offroad' || bikeKind === 'mtb') {
    filter =
      'way["highway"~"track|path"]["surface"~"gravel|ground|dirt|fine_gravel|unpaved",i]';
  } else if (bikeKind === 'gravel') {
    filter =
      'way["highway"~"cycleway|path|track"]["bicycle"!="no"]';
  } else {
    filter =
      'way["highway"="cycleway"];way["cycleway"];way["bicycle"~"designated|yes"]["highway"~"path|residential|service|track"]';
  }

  const query = `[out:json][timeout:20];(${filter}(${bbox}););out geom;`;

  try {
    const elements = await fetchOverpassElements('cycleways', query, 20000);

    const networkPoints = [];
    for (const way of elements) {
      if (!Array.isArray(way.geometry) || !way.geometry.length) {
        continue;
      }
      const tags = way.tags || {};
      const isOffroad = /gravel|ground|dirt|fine_gravel|unpaved/i.test(String(tags.surface || ''))
        || /track|path/i.test(String(tags.highway || ''));

      for (let i = 0; i < way.geometry.length; i += 3) {
        const node = way.geometry[i];
        networkPoints.push({ lat: node.lat, lon: node.lon, isOffroad });
      }

      if (networkPoints.length > 5000) {
        break;
      }
    }

    return networkPoints;
  } catch (error) {
    logOptionalLookupFailure('Cycleway network', error);
    return [];
  }
}

function logOptionalLookupFailure(label, error) {
  const message = error.message || 'unknown error';
  const isTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(message);

  if (!isTimeout || DEBUG_OPTIONAL_LOOKUPS) {
    console.warn(`${label} lookup failed:`, message);
  }
}

function getMajorRoadClass(tags) {
  const highway = String(tags.highway || '');
  const ref = String(tags.ref || '');

  if (/motorway/.test(highway)) {
    return 'motorway';
  }
  if (/trunk/.test(highway)) {
    return 'trunk';
  }
  if (/(^|;)B\s*\d+/i.test(ref)) {
    return 'bundesstrasse';
  }
  if (/primary/.test(highway)) {
    return 'primary';
  }
  return 'major';
}

function getMajorRoadWeight(roadClass) {
  switch (roadClass) {
    case 'motorway': return 2.4;
    case 'trunk': return 2.0;
    case 'bundesstrasse': return 1.8;
    case 'primary': return 1.35;
    default: return 1;
  }
}

function scoreRouteCycleAffinity(route, networkPoints, majorRoadPoints, fastestDistance, bikeType, preference, rideType = 'z2') {
  const bikeKind = getBikeKind(bikeType);
  const coords = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  if (!coords.length) {
    return { totalScore: -9999, cycleCoverage: 0, offroadCoverage: 0, detourFactor: 99 };
  }

  const sampled = sampleRouteCoordinates(coords, 120);
  let cycleHits = 0;
  let offroadHits = 0;
  let majorRoadPenalty = 0;

  for (const coord of sampled) {
    const lat = coord[1];
    const lon = coord[0];
    const nearest = findNearestNetworkPointKm(lat, lon, networkPoints);
    if (nearest && nearest.distanceKm <= 0.06) {
      cycleHits += 1;
      if (nearest.point.isOffroad) {
        offroadHits += 1;
      }
    }

    const nearestMajor = findNearestNetworkPointKm(lat, lon, majorRoadPoints);
    if (nearestMajor && nearestMajor.distanceKm <= 0.1) {
      majorRoadPenalty += nearestMajor.point.weight || 1;
    }
  }

  const cycleCoverage = sampled.length ? cycleHits / sampled.length : 0;
  const offroadCoverage = sampled.length ? offroadHits / sampled.length : 0;
  const majorRoadCoverage = sampled.length ? majorRoadPenalty / sampled.length : 0;
  const detourFactor = (route.distance || fastestDistance) / Math.max(fastestDistance, 1);

  const cycleWeight = preference === 'fastest' ? 55 : 95;
  const offroadWeight = (preference === 'offroad' || bikeKind === 'mtb') ? 80 : 20;
  const detourPenaltyWeight = preference === 'fastest' ? 120 : 50;
  const majorRoadPenaltyWeight = preference === 'fastest' ? 190 : 240;

  // Ride-type hill preference: SST/Threshold reward ascent; TT/Z2 treat it neutrally.
  const ascentM = route.ascent || 0;
  const hillBonus = (['sst', 'threshold'].includes(rideType))
    ? Math.min(ascentM / 50, 15)
    : (['tt'].includes(rideType) ? -Math.min(ascentM / 30, 20) : 0);

  const totalScore =
    cycleCoverage * cycleWeight +
    offroadCoverage * offroadWeight -
    majorRoadCoverage * majorRoadPenaltyWeight -
    Math.max(0, detourFactor - 1) * detourPenaltyWeight +
    hillBonus;

  return {
    totalScore,
    cycleCoverage,
    offroadCoverage,
    majorRoadCoverage,
    detourFactor
  };
}

function sampleRouteCoordinates(coordinates, maxPoints) {
  if (coordinates.length <= maxPoints) {
    return coordinates;
  }

  const out = [coordinates[0]];
  const step = (coordinates.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    out.push(coordinates[Math.round(i * step)]);
  }
  out.push(coordinates[coordinates.length - 1]);
  return out;
}

function findNearestNetworkPointKm(lat, lon, networkPoints) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const point of networkPoints) {
    // Fast coarse reject in degrees to reduce haversine calls.
    if (Math.abs(point.lat - lat) > 0.0012 || Math.abs(point.lon - lon) > 0.0018) {
      continue;
    }

    const d = getDistanceFromLatLon(lat, lon, point.lat, point.lon);
    if (d < bestDist) {
      bestDist = d;
      best = point;
    }
  }

  if (!best) {
    return null;
  }

  return { point: best, distanceKm: bestDist };
}

function pickPreferredRoute(candidates, guidedRoute, preference, rideType = 'z2') {
  const fastest = candidates.reduce((acc, route) => {
    if (!acc || route.duration < acc.duration) {
      return route;
    }
    return acc;
  }, null);

  if (preference === 'fastest') {
    return fastest ? { route: fastest, strategy: 'fastest' } : null;
  }

  if (guidedRoute && fastest) {
    const detourFactor = guidedRoute.distance / Math.max(fastest.distance, 1);
    const maxDetour = preference === 'offroad' ? 2.5 : 1.9;
    if (detourFactor <= maxDetour) {
      return {
        route: guidedRoute,
        strategy: preference === 'offroad' ? 'guided-track' : 'guided-cycleway'
      };
    }
  }

  // Fallback if no guided route is available: prefer a non-fastest alternative.
  const sorted = [...candidates].sort((a, b) => a.duration - b.duration);
  const alt = sorted[1] || sorted[0];
  return alt ? { route: alt, strategy: `${preference}-alternative` } : null;
}

async function findPreferenceWaypoints(start, end, bikeType, preference) {
  const bikeKind = getBikeKind(bikeType);
  const midLat = (start[0] + end[0]) / 2;
  const midLon = (start[1] + end[1]) / 2;
  const radius = preference === 'offroad' ? 9000 : 7000;

  let tagFilter;
  if (preference === 'offroad' || bikeKind === 'mtb') {
    tagFilter = '["highway"~"track|path"]["surface"~"gravel|ground|dirt|fine_gravel|unpaved",i]';
  } else if (bikeKind === 'gravel') {
    tagFilter = '["highway"~"cycleway|path|track"]["bicycle"!="no"]';
  } else {
    tagFilter = '["highway"~"cycleway|path"]["bicycle"!="no"]';
  }

  const query = `[out:json][timeout:20];way(around:${radius},${midLat},${midLon})${tagFilter};out geom;`;

  try {
    const elements = await fetchOverpassElements('preference-waypoints', query, 20000);
    if (!elements.length) {
      return [];
    }

    const candidates = [];
    let inspected = 0;

    for (const way of elements) {
      if (!Array.isArray(way.geometry) || !way.geometry.length) {
        continue;
      }
      inspected += 1;
      if (inspected > 700) {
        break;
      }

      const midNode = way.geometry[Math.floor(way.geometry.length / 2)];
      const toLine = distancePointToSegmentKm(midNode.lat, midNode.lon, start[0], start[1], end[0], end[1]);
      const toMid = getDistanceFromLatLon(midNode.lat, midNode.lon, midLat, midLon);
      const direct = getDistanceFromLatLon(start[0], start[1], end[0], end[1]);
      const detourEstimate =
        getDistanceFromLatLon(start[0], start[1], midNode.lat, midNode.lon) +
        getDistanceFromLatLon(midNode.lat, midNode.lon, end[0], end[1]);
      const score = (toLine * 0.65) + (toMid * 0.35) + Math.max(0, detourEstimate - direct) * 0.2;
      candidates.push({ point: [midNode.lat, midNode.lon], score });
    }

    if (!candidates.length) {
      return [];
    }

    const sorted = candidates.sort((a, b) => a.score - b.score).slice(0, 8);
    const snapped = [];
    for (const candidate of sorted) {
      const snappedPoint = await snapToNetwork(candidate.point, PROFILES[bikeKind] || 'cycling');
      if (snappedPoint) {
        snapped.push(snappedPoint);
      }
    }

    return dedupePoints(snapped);
  } catch (error) {
    // Overpass should not break core routing; silently fallback.
    console.warn('Overpass waypoint lookup failed:', error.message);
    return [];
  }
}

async function snapToNetwork(point, profile) {
  try {
    const response = await axios.get(
      `${OSRM_API}/nearest/v1/${profile}/${point[1]},${point[0]}`,
      { timeout: 10000 }
    );
    const waypoints = response.data && response.data.waypoints ? response.data.waypoints : [];
    if (!waypoints.length || !Array.isArray(waypoints[0].location)) {
      return null;
    }
    return [waypoints[0].location[1], waypoints[0].location[0]];
  } catch (_) {
    return null;
  }
}

function dedupePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const key = `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function distancePointToSegmentKm(px, py, ax, ay, bx, by) {
  // Planar approximation is sufficient for local ranking of candidates.
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;

  if (ab2 === 0) {
    return getDistanceFromLatLon(px, py, ax, ay);
  }

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return getDistanceFromLatLon(px, py, cx, cy);
}

function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Analyze route for terrain type, surface, etc
 * Uses OSM data through OSRM
 */
async function analyzeRoute(coordinates) {
  try {
    // Call OSRM match service to snap to road network and get data
    const coordinateString = coordinates
      .map(coord => `${coord[1]},${coord[0]}`)
      .join(';');

    const response = await axios.get(
      `${OSRM_API}/match/v1/cycling/${coordinateString}`,
      {
        params: {
          overview: 'full',
          geometries: 'geojson',
          annotations: 'duration,distance,speed'
        }
      }
    );

    if (response.data.matchings.length === 0) {
      throw new Error('Could not match route to road network');
    }

    const matching = response.data.matchings[0];
    const totalDistance = matching.distance;
    const totalDuration = matching.duration;

    return {
      matchedGeometry: matching.geometry,
      distance: totalDistance,
      duration: totalDuration,
      speed: totalDistance > 0 ? (totalDistance / totalDuration) * 3.6 : 0, // km/h
      confidence: matching.confidence,
      roadTypes: ['paved', 'unpaved'], // Would need custom OSM processing for precision
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Route analysis error:', error.message);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}

module.exports = {
  getRoute,
  getBikeProfiles,
  analyzeRoute,
  getRoutingEngineInfo,
  PROFILES,
  PREFERENCE_PROFILES
};
