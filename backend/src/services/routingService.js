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
  const normalizedWaypoints = normalizeWaypoints(waypoints);
  const hasIntermediateVias = normalizedWaypoints.length > 0;
  const routePoints = [start, ...normalizedWaypoints, end];
  const routeContext = { requestedPoints: routePoints };

  try {
    const baseRouteResponse = await requestRoute(profile, routePoints, {
      // BRouter alternatives can include visually odd loop-heavy detours.
      // Keep OSRM alternatives, and for BRouter enable alternatives when vias exist
      // so dead-end spur variants can be filtered by shape scoring.
      alternatives: ROUTING_ENGINE !== 'brouter' || normalizedWaypoints.length > 0,
      continue_straight: preference === 'fastest',
      bikeType,
      preference,
      routeContext
    });

    const baseCandidates = baseRouteResponse.routes || [];
    if (!baseCandidates.length) {
      throw new Error('No route found');
    }

    // Safety filter: avoid crossing railway tracks away from known rail crossings.
    const railwaySafetyData = await loadRailwaySafetyData(routePoints);
    const baseRailPartition = partitionRoutesByRailwaySafety(baseCandidates, railwaySafetyData);
    const filteredBaseCandidates = baseRailPartition.safeRoutes.length
      ? baseRailPartition.safeRoutes
      : baseCandidates;

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
            rideType,
            routeContext: { requestedPoints: [start, ...normalizeWaypoints(waypoints), viaPoint, end] }
          });

          if (guidedResponse.routes && guidedResponse.routes.length) {
            const guidedCandidate = guidedResponse.routes[0];
            const guidedSafety = assessRouteRailwaySafety(guidedCandidate, railwaySafetyData);
            if (!guidedSafety.hasUnsafeCrossing) {
              guidedRoute = guidedCandidate;
            }
            break;
          }
        } catch (guidedError) {
          // Continue with next candidate waypoint.
        }
      }
    }

    let selected = pickPreferredRoute(
      filteredBaseCandidates,
      guidedRoute,
      effectivePreference,
      rideType,
      hasIntermediateVias
    );

    // Active preference of OSM cycle infrastructure in corridor between start/end.
    const cycleRanked = await selectByCyclewayAffinity(
      filteredBaseCandidates,
      guidedRoute,
      start,
      end,
      bikeType,
      effectivePreference,
      rideType,
      hasIntermediateVias
    );

    if (cycleRanked) {
      selected = cycleRanked;
    }

    if (!selected) {
      throw new Error('No route found after preference selection');
    }

    // Hard guardrail: routes with explicit vias must not detour excessively.
    const fastestDistance = Math.min(
      ...filteredBaseCandidates.map((candidate) => Number(candidate.distance) || Number.POSITIVE_INFINITY)
    );
    const selectedDistance = Number(selected.route && selected.route.distance) || Number.POSITIVE_INFINITY;
    const selectedDetourFactor = selectedDistance / Math.max(fastestDistance, 1);
    const maxDetourWithVias = preference === 'offroad' ? 1.2 : 1.15;
    if (hasIntermediateVias && selectedDetourFactor > maxDetourWithVias) {
      const bestDirect = filteredBaseCandidates
        .slice()
        .sort((a, b) => (Number(a.distance) || Number.POSITIVE_INFINITY) - (Number(b.distance) || Number.POSITIVE_INFINITY))[0];
      if (bestDirect) {
        selected = { route: bestDirect, strategy: 'via-detour-guard' };
      }
    }

    if (selected.route && selected.route._unsafeRailCrossings > 0 && !baseRailPartition.safeRoutes.length) {
      // Railway data can be incomplete; if no fully safe candidate exists, prefer minimal-risk route.
      const leastUnsafe = baseCandidates
        .slice()
        .sort((a, b) => {
          const aUnsafe = Number(a && a._unsafeRailCrossings) || 0;
          const bUnsafe = Number(b && b._unsafeRailCrossings) || 0;
          return aUnsafe - bUnsafe || (a.distance || Number.POSITIVE_INFINITY) - (b.distance || Number.POSITIVE_INFINITY);
        })[0];
      if (leastUnsafe) {
        selected = { route: leastUnsafe, strategy: 'railway-relaxed-min-risk' };
      }
    }

    const route = selected.route;

    return {
      geometry: route.geometry,
      distance: route.distance, // meters
      duration: route.duration, // seconds
      ascent: route.ascent || 0,   // meters total elevation gain
      descent: route.descent || 0,
      legs: route.legs,
      routeStats: route.routeStats || null,
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
      fallbackReason: route._fallbackReason || null,
      shapeWarning: route._shapeWarning || null,
      railwaySafety: {
        available: Boolean(railwaySafetyData && railwaySafetyData.available),
        unsafeCrossings: Number(route && route._unsafeRailCrossings) || 0,
        strictSafeRouteAvailable: Boolean(baseRailPartition.safeRoutes.length)
      },
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
  let brouterFallbackReason = null;

  if (ROUTING_ENGINE === 'brouter') {
    try {
      return await requestRouteBrouter(points, options);
    } catch (error) {
      // Keep the app usable if local BRouter is not available.
      const reason = error.message || 'unknown error';
      console.warn(`BRouter failed, falling back to OSRM: ${reason}`);
      fellBackFromBrouter = true;
      brouterFallbackReason = reason;
    }
  }

  const coordinates = points.map((p) => `${p[1]},${p[0]}`).join(';');
  const response = await axios.get(`${OSRM_API}/route/v1/${profile}/${coordinates}`, {
    params: {
      overview: 'full',
      steps: true,
      geometries: 'geojson',
      annotations: 'duration,distance,speed',
      alternatives: (options.alternatives || fellBackFromBrouter) ? 3 : false,
      continue_straight: options.continue_straight ? true : false
    },
    timeout: 15000
  });

  const data = response.data || {};
  data.routes = Array.isArray(data.routes)
    ? data.routes.map((route) => normalizeOsrmRoute(route, options.routeContext, fellBackFromBrouter, brouterFallbackReason))
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
  const hasIntermediateVias = Array.isArray(options.routeContext && options.routeContext.requestedPoints)
    ? options.routeContext.requestedPoints.length > 2
    : false;

  const alternatives = options.alternatives ? [0, 1, 2] : [0];
  const routes = [];
  const errors = [];
  const profile = resolveBrouterProfile(options);

  for (const alternativeidx of alternatives) {
    try {
      const response = await axios.get(BROUTER_API, {
        params: {
          lonlats: points.map((p) => `${p[1]},${p[0]}`).join('|'),
          profile,
          alternativeidx,
          format: 'geojson'
        },
        timeout: 25000
      });

      const feature = response.data && Array.isArray(response.data.features)
        ? response.data.features[0]
        : null;
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
        errors.push(`alt ${alternativeidx}: empty GeoJSON response`);
        continue;
      }

      routes.push(normalizeBrouterFeature(feature, options.routeContext));
    } catch (error) {
      errors.push(`alt ${alternativeidx}: ${formatBrouterError(error)}`);
      // Try next alternative candidate.
    }
  }

  if (!routes.length) {
    throw new Error(`BRouter returned no route for profile ${profile}: ${errors.join('; ') || 'no details'}`);
  }

  const sortedRoutes = routes.sort((a, b) => (
    (getRouteShapePenalty(a) - getRouteShapePenalty(b))
    || ((Number(a && a._maxOutAndBackKm) || 0) - (Number(b && b._maxOutAndBackKm) || 0))
    || (a.distance - b.distance)
  ));
  const cleanRoutes = sortedRoutes.filter((route) => {
    if (!isRouteShapeAcceptable(route, options.preference, hasIntermediateVias)) {
      return false;
    }

    // With explicit vias we are stricter against dead-end out-and-back artifacts.
    if (hasIntermediateVias) {
      const maxOutAndBackKm = Number(route && route._maxOutAndBackKm) || 0;
      const spurScore = Number(route && route._outAndBackSpurScore) || 0;
      if (maxOutAndBackKm > 0.18 || spurScore > 0.34) {
        return false;
      }
    }

    return true;
  });

  if (cleanRoutes.length) {
    return { routes: cleanRoutes };
  }

  if (DEBUG_OPTIONAL_LOOKUPS) {
    console.warn(
      `BRouter returned only high-shape-penalty routes; keeping best BRouter candidate (${getRouteShapePenalty(sortedRoutes[0]).toFixed(3)})`
    );
  }

  // BRouter is still the safer engine for bike routing. A route that looks
  // detour-heavy should stay editable in the app instead of silently falling
  // back to OSRM, which can produce unsafe bike routes.
  const fallbackRoute = hasIntermediateVias
    ? [...sortedRoutes].sort((a, b) => {
      const aSpur = Number(a && a._maxOutAndBackKm) || 0;
      const bSpur = Number(b && b._maxOutAndBackKm) || 0;
      return aSpur - bSpur || getRouteShapePenalty(a) - getRouteShapePenalty(b) || a.distance - b.distance;
    })[0]
    : sortedRoutes[0];

  fallbackRoute._shapeWarning = {
    reason: 'detour-heavy',
    shapePenalty: Number(getRouteShapePenalty(fallbackRoute).toFixed(3)),
    maxOutAndBackKm: Number((Number(fallbackRoute && fallbackRoute._maxOutAndBackKm) || 0).toFixed(2))
  };

  return { routes: [fallbackRoute] };
}

function normalizeOsrmRoute(route, routeContext = {}, fellBackFromBrouter = false, fallbackReason = null) {
  const coordinates = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  const shapeScore = computeRouteShapeScore(coordinates, routeContext.requestedPoints);

  return {
    ...route,
    _engine: 'osrm',
    _fallbackFrom: fellBackFromBrouter ? 'brouter' : null,
    _fallbackReason: fallbackReason,
    _backtrackingScore: shapeScore.backtrackingScore,
    _axisRegressionScore: shapeScore.axisRegressionScore,
    _corridorDetourScore: shapeScore.corridorDetourScore,
    _outAndBackSpurScore: shapeScore.outAndBackSpurScore,
    _maxOutAndBackKm: shapeScore.maxOutAndBackKm
  };
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

function formatBrouterError(error) {
  if (error.response) {
    const body = typeof error.response.data === 'string'
      ? error.response.data.slice(0, 180).replace(/\s+/g, ' ')
      : JSON.stringify(error.response.data || {}).slice(0, 180);
    return `HTTP ${error.response.status}${body ? ` ${body}` : ''}`;
  }

  return error.message || 'unknown error';
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

function getRouteShapePenalty(route) {
  return Math.max(
    Number(route && route._backtrackingScore) || 0,
    Number(route && route._axisRegressionScore) || 0,
    (Number(route && route._corridorDetourScore) || 0) * 0.6,
    (Number(route && route._outAndBackSpurScore) || 0) * 0.9
  );
}

function getPreferredShapeLimit(preference, hasIntermediateVias = false) {
  if (hasIntermediateVias) {
    return preference === 'offroad' ? 0.1 : 0.08;
  }

  if (preference === 'fastest') {
    return 0.08;
  }

  return preference === 'offroad' ? 0.16 : 0.14;
}

function getHardShapeLimit(preference, hasIntermediateVias = false) {
  if (hasIntermediateVias) {
    return preference === 'offroad' ? 0.18 : 0.14;
  }

  if (preference === 'fastest') {
    return 0.16;
  }

  return preference === 'offroad' ? 0.3 : 0.24;
}

function isRouteShapeAcceptable(route, preference, hasIntermediateVias = false) {
  if (!route) {
    return false;
  }

  if (getRouteShapePenalty(route) > getPreferredShapeLimit(preference, hasIntermediateVias)) {
    return false;
  }

  const maxOutAndBackKm = Number(route && route._maxOutAndBackKm) || 0;
  if (hasIntermediateVias && maxOutAndBackKm > 0.18) {
    return false;
  }

  return true;
}

function shouldRejectRouteShape(route, preference, hasIntermediateVias = false) {
  if (!route) {
    return true;
  }

  if (getRouteShapePenalty(route) > getHardShapeLimit(preference, hasIntermediateVias)) {
    return true;
  }

  const maxOutAndBackKm = Number(route && route._maxOutAndBackKm) || 0;
  return hasIntermediateVias ? maxOutAndBackKm > 0.35 : maxOutAndBackKm > 0.75;
}

function normalizeBrouterFeature(feature, routeContext = {}) {
  const coordinates = feature.geometry.coordinates;
  const distanceMeters = computePolylineDistanceMeters(coordinates);
  const shapeScore = computeRouteShapeScore(coordinates, routeContext.requestedPoints);

  const props = feature.properties || {};
  const rawSeconds = Number(props['total-time']);
  const durationSeconds = Number.isFinite(rawSeconds) && rawSeconds > 0
    ? rawSeconds
    : estimateRideDurationSeconds(distanceMeters);

  // BRouter returns elevation gain as 'filtered ascend' (noise-filtered ascent in meters).
  // 'plain-ascend' is the net altitude change. There is no 'total-descent' property.
  const ascent  = Number(props['filtered ascend']) || 0;
  const descent = 0; // BRouter v1.7.9 does not expose total descent in GeoJSON properties

  const routeStats = parseBrouterRouteStats(props.messages);

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
    routeStats,
    _engine: 'brouter',
    _fallbackFrom: null,
    _backtrackingScore: shapeScore.backtrackingScore,
    _axisRegressionScore: shapeScore.axisRegressionScore,
    _corridorDetourScore: shapeScore.corridorDetourScore,
    _outAndBackSpurScore: shapeScore.outAndBackSpurScore,
    _maxOutAndBackKm: shapeScore.maxOutAndBackKm
  };
}

/**
 * Parse BRouter GeoJSON messages into highway-type and surface-type distributions.
 * Each row in messages is a segment; Distance is cumulative meters from start.
 * We diff consecutive distances to get per-segment length.
 */
function parseBrouterRouteStats(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return null;
  }
  const [header, ...rows] = messages;
  const distIdx = header.indexOf('Distance');
  const tagIdx  = header.indexOf('WayTags');
  if (distIdx === -1 || tagIdx === -1) return null;

  const hwMeters  = {};
  const sfMeters  = {};
  let prevDist = 0;

  for (const row of rows) {
    const cumDist = Number(row[distIdx]) || 0;
    const segLen  = Math.max(0, cumDist - prevDist);
    prevDist = cumDist;

    const tags = {};
    for (const kv of row[tagIdx].split(' ')) {
      const eq = kv.indexOf('=');
      if (eq > 0) tags[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    const hw = tags.highway || 'unknown';
    const sf = tags.surface || 'unknown';
    hwMeters[hw] = (hwMeters[hw] || 0) + segLen;
    sfMeters[sf] = (sfMeters[sf] || 0) + segLen;
  }

  const totalMeters = Object.values(hwMeters).reduce((s, v) => s + v, 0) || 1;

  function toSortedEntries(map) {
    return Object.entries(map)
      .map(([type, meters]) => ({ type, meters: Math.round(meters), pct: Math.round(100 * meters / totalMeters) }))
      .sort((a, b) => b.meters - a.meters);
  }

  return {
    totalMeters: Math.round(totalMeters),
    highwayTypes: toSortedEntries(hwMeters),
    surfaceTypes: toSortedEntries(sfMeters)
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

function computeRouteShapeScore(coordinates, requestedPoints = []) {
  const backtrackingScore = computeBacktrackingScore(coordinates);
  const segmentScores = computeSegmentRegressionScores(coordinates, requestedPoints);
  const spurScores = computeOutAndBackSpurScore(coordinates);
  return {
    backtrackingScore: Math.max(backtrackingScore, segmentScores.axisRegressionScore),
    axisRegressionScore: segmentScores.axisRegressionScore,
    corridorDetourScore: segmentScores.corridorDetourScore,
    outAndBackSpurScore: spurScores.outAndBackSpurScore,
    maxOutAndBackKm: spurScores.maxOutAndBackKm
  };
}

function computeOutAndBackSpurScore(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 10) {
    return { outAndBackSpurScore: 0, maxOutAndBackKm: 0 };
  }

  const sampled = sampleRouteCoordinates(coordinates, 260);
  if (sampled.length < 10) {
    return { outAndBackSpurScore: 0, maxOutAndBackKm: 0 };
  }

  const cumulativeKm = [0];
  for (let i = 1; i < sampled.length; i++) {
    cumulativeKm[i] = cumulativeKm[i - 1] + getDistanceFromLatLon(
      sampled[i - 1][1], sampled[i - 1][0],
      sampled[i][1], sampled[i][0]
    );
  }

  let spurCount = 0;
  let maxOutAndBackKm = 0;

  // Detect local "go out and come back close to the same point" artifacts.
  for (let i = 10; i < sampled.length; i++) {
    for (let j = 0; j < i - 8; j++) {
      const closureKm = getDistanceFromLatLon(sampled[i][1], sampled[i][0], sampled[j][1], sampled[j][0]);
      if (closureKm > 0.02) {
        continue;
      }

      const pathKm = cumulativeKm[i] - cumulativeKm[j];
      if (pathKm < 0.18 || pathKm > 4.5) {
        continue;
      }

      const outAndBackKm = Math.max(0, pathKm - closureKm);
      if (outAndBackKm < 0.14) {
        continue;
      }

      spurCount += 1;
      if (outAndBackKm > maxOutAndBackKm) {
        maxOutAndBackKm = outAndBackKm;
      }
      break;
    }
  }

  const outAndBackSpurScore = Math.min(1, maxOutAndBackKm / 0.9 + spurCount * 0.12);
  return { outAndBackSpurScore, maxOutAndBackKm };
}

function computeBacktrackingScore(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 8) {
    return 0;
  }

  const sampled = sampleRouteCoordinates(coordinates, 240);
  const cumulativeKm = [0];
  for (let i = 1; i < sampled.length; i++) {
    cumulativeKm[i] = cumulativeKm[i - 1] + getDistanceFromLatLon(
      sampled[i - 1][1], sampled[i - 1][0],
      sampled[i][1], sampled[i][0]
    );
  }

  let revisits = 0;
  let uTurns = 0;
  for (let i = 6; i < sampled.length; i++) {
    const current = sampled[i];
    for (let j = 0; j < i - 4; j++) {
      if (cumulativeKm[i] - cumulativeKm[j] < 0.35) {
        continue;
      }
      const distanceKm = getDistanceFromLatLon(current[1], current[0], sampled[j][1], sampled[j][0]);
      if (distanceKm < 0.03) {
        revisits += 1;
        break;
      }
    }
  }

  for (let i = 2; i < sampled.length - 2; i++) {
    const angle = Math.abs(turnAngleDegrees(sampled[i - 2], sampled[i], sampled[i + 2]));
    const localDistanceKm = getDistanceFromLatLon(sampled[i - 2][1], sampled[i - 2][0], sampled[i][1], sampled[i][0])
      + getDistanceFromLatLon(sampled[i][1], sampled[i][0], sampled[i + 2][1], sampled[i + 2][0]);
    if (angle > 160 && localDistanceKm < 0.25) {
      uTurns += 1;
    }
  }

  // Scale down incidental near-parallel revisits; keep explicit U-turns stronger.
  return sampled.length ? Math.min(1, (revisits + uTurns * 3) / (sampled.length * 5)) : 0;
}

function computeSegmentRegressionScores(coordinates, requestedPoints = []) {
  // Axis regression is only meaningful when at least one explicit via segment exists.
  // For plain start->end routes, this metric over-penalizes legitimate scenic arcs.
  if (!Array.isArray(coordinates) || coordinates.length < 8 || !Array.isArray(requestedPoints) || requestedPoints.length < 3) {
    return { axisRegressionScore: 0, corridorDetourScore: 0 };
  }

  const route = coordinates.map((coord) => [coord[1], coord[0]]);
  const vias = requestedPoints.map((point) => [Number(point[0]), Number(point[1])])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (vias.length < 2) {
    return { axisRegressionScore: 0, corridorDetourScore: 0 };
  }

  let worstRegression = 0;
  let worstCorridor = 0;
  let searchStart = 0;

  for (let viaIndex = 0; viaIndex < vias.length - 1; viaIndex++) {
    const a = vias[viaIndex];
    const b = vias[viaIndex + 1];
    const startIndex = findNearestRouteIndex(route, a, searchStart);
    const endIndex = findNearestRouteIndex(route, b, startIndex + 1);
    if (startIndex < 0 || endIndex <= startIndex + 4) {
      continue;
    }

    const segment = route.slice(startIndex, endIndex + 1);
    const segmentScore = computeAxisRegressionForSegment(segment, a, b);
    worstRegression = Math.max(worstRegression, segmentScore.axisRegressionScore);
    worstCorridor = Math.max(worstCorridor, segmentScore.corridorDetourScore);
    searchStart = endIndex;
  }

  return {
    axisRegressionScore: worstRegression,
    corridorDetourScore: worstCorridor
  };
}

function computeAxisRegressionForSegment(segment, start, end) {
  const axis = toLocalVector(start, end, start);
  const axisLength2 = axis.x * axis.x + axis.y * axis.y;
  if (axisLength2 <= 1e-10) {
    return { axisRegressionScore: 0, corridorDetourScore: 0 };
  }

  let previousProjection = null;
  let negativeDistanceKm = 0;
  let totalDistanceKm = 0;
  let maxCorridorKm = 0;

  for (let i = 0; i < segment.length; i++) {
    const local = toLocalVector(start, segment[i], start);
    const projection = (local.x * axis.x + local.y * axis.y) / axisLength2;
    const cross = Math.abs(local.x * axis.y - local.y * axis.x) / Math.sqrt(axisLength2);
    maxCorridorKm = Math.max(maxCorridorKm, cross);

    if (i > 0) {
      const stepKm = getDistanceFromLatLon(segment[i - 1][0], segment[i - 1][1], segment[i][0], segment[i][1]);
      totalDistanceKm += stepKm;
      if (projection < previousProjection - 0.015) {
        negativeDistanceKm += stepKm;
      }
    }

    previousProjection = projection;
  }

  const axisDistanceKm = getDistanceFromLatLon(start[0], start[1], end[0], end[1]);
  const corridorLimitKm = Math.max(0.45, axisDistanceKm * 0.45);

  return {
    axisRegressionScore: totalDistanceKm ? negativeDistanceKm / totalDistanceKm : 0,
    corridorDetourScore: Math.max(0, (maxCorridorKm - corridorLimitKm) / Math.max(corridorLimitKm, 0.1))
  };
}

function findNearestRouteIndex(route, point, startIndex = 0) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = Math.max(0, startIndex); i < route.length; i++) {
    const distance = getDistanceFromLatLon(route[i][0], route[i][1], point[0], point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function toLocalVector(origin, point, reference) {
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos((reference[0] || origin[0]) * Math.PI / 180);
  return {
    x: (point[1] - origin[1]) * lonScale,
    y: (point[0] - origin[0]) * latScale
  };
}

async function selectByCyclewayAffinity(baseCandidates, guidedRoute, start, end, bikeType, preference, rideType = 'z2', hasIntermediateVias = false) {
  const bikeKind = getBikeKind(bikeType);
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
  const maxShapePenalty = preference === 'fastest' ? 0.03 : 0.06;
  const maxDetourFactor = hasIntermediateVias
    ? (preference === 'offroad' ? 1.2 : 1.15)
    : (preference === 'offroad' ? 1.9 : (preference === 'scenic' ? 1.45 : 1.2));
  const eligibleRoutes = routePool.filter((route) => {
    const shapePenalty = getRouteShapePenalty(route);
    const detourFactor = (route.distance || fastestDistance) / Math.max(fastestDistance, 1);
    const unsafeRailCrossings = Number(route && route._unsafeRailCrossings) || 0;
    return shapePenalty <= maxShapePenalty
      && detourFactor <= maxDetourFactor
      // Allow small uncertainty in OSM crossing tagging; hard-fail only on clearly unsafe routes.
      && unsafeRailCrossings <= 1;
  });

  if (!eligibleRoutes.length) {
    return null;
  }

  let best = null;

  for (const route of eligibleRoutes) {
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

  if (best.metrics.backtrackingScore > maxShapePenalty) {
    return null;
  }

  // Guardrails: for fastest preference do not aggressively detour.
  if (preference === 'fastest' && best.metrics.detourFactor > 1.2) {
    return null;
  }

  if ((preference === 'scenic' || preference === 'offroad') && best.metrics.cycleCoverage < 0.08) {
    return null;
  }

  const enforceParallelCyclePreference = preference === 'scenic' || preference === 'offroad' || bikeKind === 'gravel';
  const maxMajorRoadCoverage = hasIntermediateVias
    ? (bikeKind === 'gravel' ? 0.14 : 0.18)
    : (bikeKind === 'gravel' ? 0.2 : 0.24);
  const maxParallelCycleOpportunity = hasIntermediateVias
    ? (bikeKind === 'gravel' ? 0.06 : 0.1)
    : (bikeKind === 'gravel' ? 0.1 : 0.16);

  if (enforceParallelCyclePreference && best.metrics.majorRoadCoverage > maxMajorRoadCoverage) {
    return null;
  }

  if (enforceParallelCyclePreference && best.metrics.parallelCycleOpportunity > maxParallelCycleOpportunity) {
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
      'way["highway"~"cycleway|path|track"]["bicycle"!="no"];'
      + 'way["cycleway"~"track|opposite_track|lane|opposite_lane|shared_lane",i]["highway"~"primary|secondary|tertiary|unclassified|residential|service"]';
  } else {
    filter =
      'way["highway"="cycleway"];way["cycleway"];way["bicycle"~"designated|yes"]["highway"~"path|residential|service|track"]';
  }

  const query = `[out:json][timeout:20];(${filter}(${bbox}););out geom;`;
  const relationQuery = `[out:json][timeout:20];relation["route"="bicycle"](${bbox});out body;`;
  const relationWayQuery = `[out:json][timeout:20];relation["route"="bicycle"](${bbox});way(r);out geom;`;

  try {
    const elements = await fetchOverpassElements('cycleways', query, 20000);
    const relationElements = await fetchOverpassElements('cycleway-relations', relationQuery, 20000)
      .catch(() => []);
    const relationWayElements = await fetchOverpassElements('cycleway-relation-ways', relationWayQuery, 20000)
      .catch(() => []);

    const relationPriorityByWayId = buildCycleRelationPriorityByWayId(relationElements);

    const mergedWays = new Map();
    for (const way of elements) {
      if (way && way.type === 'way' && Number.isFinite(way.id)) {
        mergedWays.set(way.id, way);
      }
    }
    for (const way of relationWayElements) {
      if (way && way.type === 'way' && Number.isFinite(way.id) && !mergedWays.has(way.id)) {
        mergedWays.set(way.id, way);
      }
    }

    const networkPoints = [];
    for (const way of mergedWays.values()) {
      if (!Array.isArray(way.geometry) || !way.geometry.length) {
        continue;
      }
      const tags = way.tags || {};
      const isOffroad = /gravel|ground|dirt|fine_gravel|unpaved/i.test(String(tags.surface || ''))
        || /track|path/i.test(String(tags.highway || ''));
      const isGravelPreferred = /gravel|ground|dirt|fine_gravel|unpaved|compacted/i.test(String(tags.surface || ''))
        || /track/i.test(String(tags.highway || ''));
      const hasRoadCycleFacility = /track|opposite_track|lane|opposite_lane|shared_lane/i.test(String(tags.cycleway || ''));
      const relationPriority = relationPriorityByWayId.get(way.id) || 0;
      const cyclePriority = getCyclewayPriority(tags, relationPriority);

      for (let i = 0; i < way.geometry.length; i += 3) {
        const node = way.geometry[i];
        networkPoints.push({
          lat: node.lat,
          lon: node.lon,
          isOffroad,
          isGravelPreferred,
          hasRoadCycleFacility,
          cyclePriority
        });
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

function buildCycleRelationPriorityByWayId(relationElements) {
  const priorityByWayId = new Map();
  for (const relation of relationElements || []) {
    if (!relation || relation.type !== 'relation') {
      continue;
    }
    const tags = relation.tags || {};
    if (String(tags.route || '').toLowerCase() !== 'bicycle') {
      continue;
    }
    const relationPriority = getCycleRelationPriority(tags);
    const members = Array.isArray(relation.members) ? relation.members : [];
    for (const member of members) {
      if (!member || member.type !== 'way' || !Number.isFinite(member.ref)) {
        continue;
      }
      const current = priorityByWayId.get(member.ref) || 0;
      if (relationPriority > current) {
        priorityByWayId.set(member.ref, relationPriority);
      }
    }
  }
  return priorityByWayId;
}

function getCycleRelationPriority(tags) {
  const network = String(tags.network || '').toLowerCase();
  const state = String(tags.state || '').toLowerCase();
  let base;
  if (network === 'icn') {
    base = 1.0;
  } else if (network === 'ncn') {
    base = 0.92;
  } else if (network === 'rcn') {
    base = 0.8;
  } else if (network === 'lcn') {
    base = 0.68;
  } else {
    base = 0.58;
  }
  if (state === 'proposed') {
    base -= 0.12;
  }
  return Math.max(0.35, Math.min(1.0, base));
}

function getCyclewayPriority(tags, relationPriority = 0) {
  const highway = String(tags.highway || '').toLowerCase();
  const cycleway = String(tags.cycleway || '').toLowerCase();
  const bicycle = String(tags.bicycle || '').toLowerCase();

  let basePriority = 0.45;
  if (highway === 'cycleway') {
    basePriority = 1.0;
  } else if (/track|opposite_track/.test(cycleway)) {
    basePriority = 0.9;
  } else if (/lane|opposite_lane|shared_lane/.test(cycleway)) {
    basePriority = 0.78;
  } else if (bicycle === 'designated') {
    basePriority = 0.72;
  } else if (/path|track/.test(highway) && bicycle !== 'no') {
    basePriority = 0.66;
  }

  return Math.max(basePriority, relationPriority);
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
  let gravelHits = 0;
  let cyclePrioritySum = 0;
  let majorRoadPenalty = 0;
  let parallelCycleOpportunityPenalty = 0;

  // Treat only very close proximity as truly being on cycle infra.
  const onCycleThresholdKm = 0.045;
  // "Parallel cycleway available" window next to major roads.
  const parallelCycleThresholdKm = 0.18;
  const majorRoadThresholdKm = 0.09;

  for (const coord of sampled) {
    const lat = coord[1];
    const lon = coord[0];
    const nearest = findNearestNetworkPointKm(lat, lon, networkPoints);
    if (nearest && nearest.distanceKm <= onCycleThresholdKm) {
      cycleHits += 1;
      cyclePrioritySum += Number(nearest.point.cyclePriority) || 0;
      if (nearest.point.isOffroad) {
        offroadHits += 1;
      }
      if (nearest.point.isGravelPreferred) {
        gravelHits += 1;
      }
    }

    const nearestMajor = findNearestNetworkPointKm(lat, lon, majorRoadPoints);
    if (nearestMajor && nearestMajor.distanceKm <= majorRoadThresholdKm) {
      majorRoadPenalty += nearestMajor.point.weight || 1;

      // Penalize staying on/near major roads when a parallel bike facility is nearby,
      // but the current line is not actually on bike infrastructure.
      if (nearest && nearest.distanceKm > onCycleThresholdKm && nearest.distanceKm <= parallelCycleThresholdKm) {
        const majorWeight = nearestMajor.point.weight || 1;
        const proximityFactor = 1 - Math.min(1, nearest.distanceKm / parallelCycleThresholdKm);
        parallelCycleOpportunityPenalty += majorWeight * Math.max(0.2, proximityFactor);
      }
    }
  }

  const cycleCoverage = sampled.length ? cycleHits / sampled.length : 0;
  const cyclePriorityCoverage = sampled.length ? cyclePrioritySum / sampled.length : 0;
  const offroadCoverage = sampled.length ? offroadHits / sampled.length : 0;
  const gravelCoverage = sampled.length ? gravelHits / sampled.length : 0;
  const majorRoadCoverage = sampled.length ? majorRoadPenalty / sampled.length : 0;
  const parallelCycleOpportunity = sampled.length ? parallelCycleOpportunityPenalty / sampled.length : 0;
  const detourFactor = (route.distance || fastestDistance) / Math.max(fastestDistance, 1);

  const cycleWeight = preference === 'fastest' ? 90 : 130;
  const cyclePriorityWeight = preference === 'fastest' ? 110 : 170;
  const offroadWeight = (preference === 'offroad' || bikeKind === 'mtb') ? 80 : 20;
  const gravelWeight = bikeKind === 'gravel' ? 75 : 0;
  const detourPenaltyWeight = preference === 'fastest' ? 120 : 50;
  const majorRoadPenaltyWeight = preference === 'fastest' ? 230 : 300;
  const parallelCycleOpportunityPenaltyWeight = preference === 'fastest' ? 340 : 420;
  const backtrackingPenaltyWeight = preference === 'fastest' ? 220 : 340;

  // Ride-type hill preference: SST/Threshold reward ascent; TT/Z2 treat it neutrally.
  const ascentM = route.ascent || 0;
  const hillBonus = (['sst', 'threshold'].includes(rideType))
    ? Math.min(ascentM / 50, 15)
    : (['tt'].includes(rideType) ? -Math.min(ascentM / 30, 20) : 0);

  const totalScore =
    cycleCoverage * cycleWeight +
    cyclePriorityCoverage * cyclePriorityWeight +
    offroadCoverage * offroadWeight -
    gravelCoverage * gravelWeight -
    majorRoadCoverage * majorRoadPenaltyWeight -
    parallelCycleOpportunity * parallelCycleOpportunityPenaltyWeight -
    (getRouteShapePenalty(route) || computeBacktrackingScore(coords)) * backtrackingPenaltyWeight -
    Math.max(0, detourFactor - 1) * detourPenaltyWeight +
    (Number(route && route._unsafeRailCrossings) || 0) * -1200 +
    hillBonus;

  return {
    totalScore,
    cycleCoverage,
    cyclePriorityCoverage,
    offroadCoverage,
    gravelCoverage,
    majorRoadCoverage,
    parallelCycleOpportunity,
    backtrackingScore: getRouteShapePenalty(route) || computeBacktrackingScore(coords),
    detourFactor,
    unsafeRailCrossings: Number(route && route._unsafeRailCrossings) || 0
  };
}

async function loadRailwaySafetyData(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { available: false, railSegments: [], crossingPoints: [] };
  }

  const bounds = getBoundsFromLatLonPoints(points, 0.03, 0.05);
  if (!bounds) {
    return { available: false, railSegments: [], crossingPoints: [] };
  }

  const approxDistanceKm = getPolylineDistanceKmFromLatLonPoints(points);
  if (approxDistanceKm > 140) {
    // Avoid huge Overpass requests for long routes.
    return { available: false, railSegments: [], crossingPoints: [] };
  }

  const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;
  const query = `[out:json][timeout:22];(
way["railway"~"rail|light_rail|tram|narrow_gauge|subway"]["disused"!="yes"]["abandoned"!="yes"]["construction"!="yes"]["bridge"!="yes"]["tunnel"!="yes"](${bbox});
node["railway"~"level_crossing|crossing"](${bbox});
node["crossing"="railway"](${bbox});
);out geom;`;

  try {
    const elements = await fetchOverpassElements('railway-safety', query, 22000);
    const railSegments = [];
    const crossingPoints = [];

    for (const element of elements) {
      if (element.type === 'way' && Array.isArray(element.geometry)) {
        for (let i = 1; i < element.geometry.length; i++) {
          const prev = element.geometry[i - 1];
          const curr = element.geometry[i];
          if (!prev || !curr) {
            continue;
          }
          railSegments.push({
            a: [prev.lat, prev.lon],
            b: [curr.lat, curr.lon],
            bbox: getSegmentBounds([prev.lat, prev.lon], [curr.lat, curr.lon])
          });
        }
      }

      if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
        crossingPoints.push({ lat: element.lat, lon: element.lon });
      }

      if (railSegments.length > 25000 && crossingPoints.length > 3000) {
        break;
      }
    }

    return {
      available: railSegments.length > 0,
      railSegments,
      crossingPoints
    };
  } catch (error) {
    logOptionalLookupFailure('Railway safety', error);
    return { available: false, railSegments: [], crossingPoints: [] };
  }
}

function partitionRoutesByRailwaySafety(routes, railwaySafetyData) {
  if (!Array.isArray(routes) || !routes.length) {
    return { safeRoutes: [], unsafeRoutes: [] };
  }

  if (!railwaySafetyData || !railwaySafetyData.available) {
    return { safeRoutes: routes, unsafeRoutes: [] };
  }

  const safeRoutes = [];
  const unsafeRoutes = [];
  for (const route of routes) {
    const safety = assessRouteRailwaySafety(route, railwaySafetyData);
    route._unsafeRailCrossings = safety.unsafeCrossings;
    if (safety.hasUnsafeCrossing) {
      unsafeRoutes.push(route);
    } else {
      safeRoutes.push(route);
    }
  }

  return { safeRoutes, unsafeRoutes };
}

function assessRouteRailwaySafety(route, railwaySafetyData) {
  const coords = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  if (!coords.length || !railwaySafetyData || !railwaySafetyData.available) {
    return { unsafeCrossings: 0, hasUnsafeCrossing: false };
  }

  const sampled = sampleRouteCoordinates(coords, 320);
  let unsafeCrossings = 0;
  const seenCrossingPoints = [];

  for (let i = 1; i < sampled.length; i++) {
    const prev = [sampled[i - 1][1], sampled[i - 1][0]]; // [lat, lon]
    const curr = [sampled[i][1], sampled[i][0]];
    const routeBbox = getSegmentBounds(prev, curr);

    for (const railSegment of railwaySafetyData.railSegments) {
      if (!bboxesOverlap(routeBbox, railSegment.bbox)) {
        continue;
      }

      if (!segmentsIntersectLatLon(prev, curr, railSegment.a, railSegment.b)) {
        continue;
      }

      const intersection = segmentIntersectionPointLatLon(prev, curr, railSegment.a, railSegment.b)
        || [
          (prev[0] + curr[0]) / 2,
          (prev[1] + curr[1]) / 2
        ];

      const alreadySeen = seenCrossingPoints.some((p) => (
        getDistanceFromLatLon(p[0], p[1], intersection[0], intersection[1]) <= 0.08
      ));
      if (alreadySeen) {
        continue;
      }

      seenCrossingPoints.push(intersection);

      const nearestCrossing = railwaySafetyData.crossingPoints.length
        ? findNearestNetworkPointKm(intersection[0], intersection[1], railwaySafetyData.crossingPoints)
        : null;
      const isSafeCrossing = Boolean(nearestCrossing && nearestCrossing.distanceKm <= 0.09);

      if (!isSafeCrossing) {
        unsafeCrossings += 1;
      }

      break;
    }
  }

  return {
    unsafeCrossings,
    hasUnsafeCrossing: unsafeCrossings > 0
  };
}

function getSegmentBounds(a, b) {
  return {
    minLat: Math.min(a[0], b[0]),
    maxLat: Math.max(a[0], b[0]),
    minLon: Math.min(a[1], b[1]),
    maxLon: Math.max(a[1], b[1])
  };
}

function bboxesOverlap(a, b) {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLon < b.minLon || a.minLon > b.maxLon);
}

function segmentsIntersectLatLon(a1, a2, b1, b2) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

function orientation(p, q, r) {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return (
    q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0])
    && q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1])
  );
}

function segmentIntersectionPointLatLon(a1, a2, b1, b2) {
  const x1 = a1[1];
  const y1 = a1[0];
  const x2 = a2[1];
  const y2 = a2[0];
  const x3 = b1[1];
  const y3 = b1[0];
  const x4 = b2[1];
  const y4 = b2[0];

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-14) {
    return null;
  }

  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return [py, px];
}

function getBoundsFromLatLonPoints(points, latPad = 0, lonPad = 0) {
  const valid = points
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

  if (!valid.length) {
    return null;
  }

  const lats = valid.map((p) => p[0]);
  const lons = valid.map((p) => p[1]);

  return {
    minLat: Math.min(...lats) - latPad,
    maxLat: Math.max(...lats) + latPad,
    minLon: Math.min(...lons) - lonPad,
    maxLon: Math.max(...lons) + lonPad
  };
}

function getPolylineDistanceKmFromLatLonPoints(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += getDistanceFromLatLon(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
  }
  return total;
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

function pickPreferredRoute(candidates, guidedRoute, preference, rideType = 'z2', hasIntermediateVias = false) {
  const routeRank = (route) => (route.duration || 0) + (getRouteShapePenalty(route) || computeBacktrackingScore(route.geometry?.coordinates)) * 3000;
  const shapeSafeCandidates = candidates.filter((route) => isRouteShapeAcceptable(route, preference, hasIntermediateVias));
  const fallbackCandidates = shapeSafeCandidates.length
    ? shapeSafeCandidates
    : candidates.filter((route) => !shouldRejectRouteShape(route, preference, hasIntermediateVias));

  if (!fallbackCandidates.length) {
    return null;
  }

  const fastest = fallbackCandidates.reduce((acc, route) => {
    if (!acc || routeRank(route) < routeRank(acc)) {
      return route;
    }
    return acc;
  }, null);

  if (preference === 'fastest') {
    return fastest ? { route: fastest, strategy: 'fastest' } : null;
  }

  if (guidedRoute && fastest && isRouteShapeAcceptable(guidedRoute, preference, hasIntermediateVias)) {
    const detourFactor = guidedRoute.distance / Math.max(fastest.distance, 1);
    const maxDetour = hasIntermediateVias
      ? (preference === 'offroad' ? 1.2 : 1.15)
      : (preference === 'offroad' ? 2.5 : 1.9);
    if (detourFactor <= maxDetour) {
      return {
        route: guidedRoute,
        strategy: preference === 'offroad' ? 'guided-track' : 'guided-cycleway'
      };
    }
  }

  // With intermediate vias, prefer the best-ranked candidate directly to avoid massive detours.
  if (hasIntermediateVias) {
    return fastest ? { route: fastest, strategy: `${preference}-via-best` } : null;
  }

  // Fallback if no guided route is available: prefer a non-fastest alternative.
  const sorted = [...fallbackCandidates].sort((a, b) => routeRank(a) - routeRank(b));
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

function turnAngleDegrees(before, current, after) {
  const incoming = bearingDegrees(current, before);
  const outgoing = bearingDegrees(current, after);
  let diff = outgoing - incoming;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function bearingDegrees(from, to) {
  const dy = to[1] - from[1];
  const dx = (to[0] - from[0]) * Math.cos(from[1] * Math.PI / 180);
  return Math.atan2(dx, dy) * 180 / Math.PI;
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
