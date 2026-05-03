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
const OSRM_BASE_URL = parseServiceBaseUrl(OSRM_API, 'OSRM_API');
const OVERPASS_API = process.env.OVERPASS_API || 'https://overpass-api.de/api/interpreter';
const OVERPASS_API_LIST = buildOverpassApiList();
const ROUTING_ENGINE = (process.env.ROUTING_ENGINE || 'brouter').toLowerCase();
const BROUTER_API = process.env.BROUTER_API || 'http://localhost:17777/brouter';
const BROUTER_CUSTOM_PROFILES_DIR = process.env.BROUTER_CUSTOM_PROFILES_DIR
  || path.resolve(__dirname, '../../../brouter-data/customprofiles');
const DEFAULT_BROUTER_CUSTOM_PROFILES_DIR = process.env.DEFAULT_BROUTER_CUSTOM_PROFILES_DIR
  || path.resolve(__dirname, '../../../default-brouter-data/customprofiles');
const BROUTER_SEGMENTS_DIR = process.env.BROUTER_SEGMENTS_DIR
  || path.resolve(__dirname, '../../../brouter-data/segments4');
const BROUTER_SEGMENTS_BASE_URL = process.env.BROUTER_SEGMENTS_BASE_URL
  || 'https://brouter.de/brouter/segments4';
const BROUTER_AUTO_FETCH_SEGMENTS = String(process.env.BROUTER_AUTO_FETCH_SEGMENTS || 'true') !== 'false';
const BROUTER_FALLBACK_TO_OSRM = String(process.env.BROUTER_FALLBACK_TO_OSRM || 'false') === 'true';
const DEBUG_OPTIONAL_LOOKUPS = String(process.env.DEBUG_OPTIONAL_LOOKUPS || 'false') === 'true';
const OPTIONAL_ROUTE_LOOKUPS_ENABLED = String(process.env.OPTIONAL_ROUTE_LOOKUPS_ENABLED || 'false') === 'true';
const RAILWAY_SAFETY_ENABLED = String(process.env.RAILWAY_SAFETY_ENABLED || (OPTIONAL_ROUTE_LOOKUPS_ENABLED ? 'true' : 'false')) === 'true';
const PREFERENCE_GUIDANCE_ENABLED = String(process.env.PREFERENCE_GUIDANCE_ENABLED || (OPTIONAL_ROUTE_LOOKUPS_ENABLED ? 'true' : 'false')) === 'true';
const CYCLEWAY_AFFINITY_ENABLED = String(process.env.CYCLEWAY_AFFINITY_ENABLED || (OPTIONAL_ROUTE_LOOKUPS_ENABLED ? 'true' : 'false')) === 'true';
const OVERPASS_CACHE_TTL_MS = Number(process.env.OVERPASS_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const WIND_SPEED_ENABLED = String(process.env.WIND_SPEED_ENABLED || 'true') !== 'false';
const WIND_API = process.env.WIND_API || 'https://api.open-meteo.com/v1/forecast';

const downloadedSegmentTiles = new Set();

function parseServiceBaseUrl(rawValue, envName) {
  const value = String(rawValue || '').trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error(`${envName} must be a valid absolute URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${envName} must use http or https`);
  }

  // Remove query/hash to prevent hidden path or host redirection behavior.
  parsed.search = '';
  parsed.hash = '';

  return parsed;
}

function sanitizeOsrmProfile(profile) {
  const value = String(profile || '').trim();
  if (!Object.values(PROFILES).includes(value)) {
    throw new Error('Invalid routing profile');
  }
  return value;
}

function normalizeCoordinateValue(value, min, max, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`Invalid ${name} coordinate`);
  }
  return numeric;
}

function toOsrmCoordinatePair(point) {
  if (!Array.isArray(point) || point.length < 2) {
    throw new Error('Invalid coordinate point');
  }

  const lat = normalizeCoordinateValue(point[0], -90, 90, 'latitude');
  const lon = normalizeCoordinateValue(point[1], -180, 180, 'longitude');
  return `${lon},${lat}`;
}

function buildOsrmRequestUrl(servicePath, coordinatePoints) {
  const safePath = String(servicePath || '').replace(/^\/+/u, '').replace(/\/+$/u, '');
  if (!safePath) {
    throw new Error('Invalid OSRM service path');
  }

  const coords = Array.isArray(coordinatePoints) ? coordinatePoints : [];
  if (!coords.length) {
    throw new Error('At least one coordinate pair is required');
  }

  const coordinateString = coords.map(toOsrmCoordinatePair).join(';');
  const basePath = OSRM_BASE_URL.pathname.replace(/\/+$/u, '');
  const url = new URL(`${basePath}/${safePath}/${coordinateString}`, OSRM_BASE_URL);
  return url.toString();
}

function buildOverpassApiList() {
  const fallbackApis = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter'
  ];

  const envApis = String(process.env.OVERPASS_API_LIST || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...new Set([
    OVERPASS_API,
    ...envApis,
    ...fallbackApis
  ])];
}

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
    riderProfile = {},
    fast = false
  } = options;
  const ftp = Number(riderProfile.ftp) > 0 ? Number(riderProfile.ftp) : 250;
  const profile = PROFILES[bikeType] || 'cycling';
  const normalizedWaypoints = normalizeWaypoints(waypoints);
  const hasIntermediateVias = normalizedWaypoints.length > 0;
  const routePoints = [start, ...normalizedWaypoints, end];
  const routeContext = { requestedPoints: routePoints };

  try {
    if (fast) {
      const fastRouteResponse = await requestRoute(profile, routePoints, {
        alternatives: false,
        continue_straight: false,
        bikeType,
        preference,
        riderProfile,
        routeContext,
        skipShapeFilter: true
      });
      const route = fastRouteResponse.routes && fastRouteResponse.routes[0];
      if (!route) {
        throw new Error('No route found');
      }

      return buildRouteResponse(route, {
        start,
        end,
        waypoints,
        bikeType,
        preference,
        rideType,
        ftp,
        strategy: 'fast-loop',
        railwaySafetyData: { available: false },
        baseRailPartition: { safeRoutes: [] }
      });
    }

    const baseRouteResponse = await requestRoute(profile, routePoints, {
      // BRouter alternatives can include visually odd loop-heavy detours.
      // Keep OSRM alternatives, and for BRouter enable alternatives when vias exist
      // so dead-end spur variants can be filtered by shape scoring.
      alternatives: ROUTING_ENGINE !== 'brouter' || normalizedWaypoints.length > 0,
      continue_straight: preference === 'fastest',
      bikeType,
      preference,
      riderProfile,
      routeContext
    });

    const baseCandidates = baseRouteResponse.routes || [];
    if (!baseCandidates.length) {
      throw new Error('No route found');
    }

    // Safety filter: avoid crossing railway tracks away from known rail crossings.
    const railwaySafetyData = RAILWAY_SAFETY_ENABLED
      ? await loadRailwaySafetyData(routePoints)
      : { available: false, railSegments: [], crossingPoints: [] };
    const baseRailPartition = partitionRoutesByRailwaySafety(baseCandidates, railwaySafetyData);
    const filteredBaseCandidates = baseRailPartition.safeRoutes.length
      ? baseRailPartition.safeRoutes
      : baseCandidates;

    // Map rideType to effective preference for route scoring.
    const effectivePreference = mapRideTypeToPreference(rideType, preference);

    // Optional cycleway orientation for scenic/offroad preferences.
    let guidedRoute = null;
    if (PREFERENCE_GUIDANCE_ENABLED && (effectivePreference === 'scenic' || effectivePreference === 'offroad')) {
      const viaPoints = await findPreferenceWaypoints(start, end, bikeType, preference);
      for (const viaPoint of viaPoints) {
        try {
          const guidedResponse = await requestRoute(profile, [start, ...normalizeWaypoints(waypoints), viaPoint, end], {
            alternatives: false,
            continue_straight: false,
            bikeType,
            preference: effectivePreference,
            rideType,
            riderProfile,
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
    const cycleRanked = CYCLEWAY_AFFINITY_ENABLED
      ? await selectByCyclewayAffinity(
        filteredBaseCandidates,
        guidedRoute,
        start,
        end,
        bikeType,
        effectivePreference,
        rideType,
        hasIntermediateVias
      )
      : null;

    if (cycleRanked) {
      selected = cycleRanked;
    }

    if (!selected) {
      const fallbackCandidate = pickBrouterFallbackRoute(filteredBaseCandidates);
      if (fallbackCandidate) {
        fallbackCandidate._shapeWarning = {
          ...(fallbackCandidate._shapeWarning || {}),
          reason: fallbackCandidate._shapeWarning?.reason || 'preference-selection-relaxed',
          shapePenalty: Number(getRouteShapePenalty(fallbackCandidate).toFixed(3)),
          maxOutAndBackKm: Number((Number(fallbackCandidate && fallbackCandidate._maxOutAndBackKm) || 0).toFixed(2))
        };
        selected = { route: fallbackCandidate, strategy: 'brouter-relaxed-best' };
      } else {
        throw new Error('No route found after preference selection');
      }
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

    const route = await applyTempoAdjustments(selected.route);

    return buildRouteResponse(route, {
      start,
      end,
      waypoints,
      bikeType,
      preference,
      rideType,
      ftp,
      strategy: selected.strategy,
      railwaySafetyData,
      baseRailPartition
    });
  } catch (error) {
    console.error(`${ROUTING_ENGINE.toUpperCase()} routing error:`, error.message);
    throw new Error(`Routing failed: ${error.message}`);
  }
}

function buildRouteResponse(route, context = {}) {
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    ascent: route.ascent || 0,
    descent: route.descent || 0,
    legs: route.legs,
    routeStats: route.routeStats || null,
    startPoint: context.start,
    endPoint: context.end,
    waypoints: normalizeWaypoints(context.waypoints),
    bikeType: context.bikeType,
    preference: context.preference,
    rideType: context.rideType,
    strategy: context.strategy,
    engineUsed: String(route._engine || ROUTING_ENGINE).toUpperCase(),
    fallbackUsed: Boolean(route._fallbackFrom),
    fallbackFrom: route._fallbackFrom ? String(route._fallbackFrom).toUpperCase() : null,
    fallbackReason: route._fallbackReason || null,
    shapeWarning: route._shapeWarning || null,
    tempoFactors: route.tempoFactors || null,
    weatherAlerts: route.weatherAlerts || null,
    railwaySafety: {
      available: Boolean(context.railwaySafetyData && context.railwaySafetyData.available),
      unsafeCrossings: Number(route && route._unsafeRailCrossings) || 0,
      strictSafeRouteAvailable: Boolean(context.baseRailPartition && context.baseRailPartition.safeRoutes && context.baseRailPartition.safeRoutes.length)
    },
    powerZone: computePowerZone(context.rideType, context.ftp, route.duration),
    timestamp: new Date().toISOString()
  };
}

async function getBikeProfiles(actor = {}) {
  const profileMap = new Map();
  const profileDirs = getBrouterProfileDirs();

  for (const profileDir of profileDirs) {
    const profiles = await readBikeProfilesFromDir(profileDir, actor);
    profiles.forEach((profile) => {
      if (!profileMap.has(profile.id)) {
        profileMap.set(profile.id, profile);
      }
    });
  }

  if (profileMap.size) {
    return [...profileMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  return [
    { id: 'road', label: 'Road', kind: 'road', source: 'fallback' },
    { id: 'gravel', label: 'Gravel', kind: 'gravel', source: 'fallback' },
    { id: 'mtb', label: 'MTB', kind: 'mtb', source: 'fallback' }
  ];
}

function getBrouterProfileDirs() {
  return [...new Set([
    BROUTER_CUSTOM_PROFILES_DIR,
    DEFAULT_BROUTER_CUSTOM_PROFILES_DIR
  ].filter(Boolean))];
}

async function readBikeProfilesFromDir(profileDir, actor = {}) {
  try {
    const entries = await fs.readdir(profileDir, { withFileTypes: true });
    const profiles = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.brf')) {
        continue;
      }

      const id = entry.name.replace(/\.brf$/i, '');
      const filePath = path.join(profileDir, entry.name);
      const metadata = await readBrouterProfileMetadata(filePath, id);
      profiles.push({
        id,
        label: metadata.label,
        kind: inferBikeKind(id),
        source: 'brouter',
        owned: isProfileOwnedByActor(metadata, actor)
      });
    }

    return profiles;
  } catch (error) {
    console.warn(`Could not load BRouter custom profiles from ${profileDir}:`, error.message);
    return [];
  }
}

async function createBikeProfile(input = {}, actor = {}) {
  const profileName = String(input.name || '').trim();
  if (!profileName) {
    throw new Error('Profile name is required');
  }

  const requestedBaseId = String(input.baseProfileId || '').trim();
  const availableProfiles = await getBikeProfiles();
  const fallbackBaseId = availableProfiles[0] ? availableProfiles[0].id : '3t-racemax';
  const baseProfileId = requestedBaseId || fallbackBaseId;

  const baseProfilePath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${baseProfileId}.brf`);
  let baseContent;
  try {
    baseContent = await fs.readFile(baseProfilePath, 'utf8');
  } catch (_) {
    throw new Error(`Base profile not found: ${baseProfileId}`);
  }

  const profileId = toProfileId(profileName);
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(profileId)) {
    throw new Error('Profile name must produce a valid id (3-49 chars, a-z, 0-9, -)');
  }

  const targetPath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${profileId}.brf`);
  const actorLabel = profileOwnerToken(actor);
  const header = [
    `# ${profileName}`,
    `# Cloned from: ${baseProfileId}`,
    `# Created by: ${actorLabel}`,
    `# Created at: ${new Date().toISOString()}`,
    ''
  ].join('\n');

  try {
    await fs.writeFile(targetPath, `${header}${baseContent}`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new Error(`Profile already exists: ${profileId}`);
    }
    throw error;
  }

  return {
    id: profileId,
    label: profileName,
    baseProfileId,
    kind: inferBikeKind(profileId),
    source: 'brouter',
    owned: true
  };
}

async function renameBikeProfile(profileId, nextName, actor = {}) {
  const currentId = String(profileId || '').trim();
  const newName = String(nextName || '').trim();
  if (!currentId || !newName) {
    throw new Error('Profile id and new name are required');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(currentId)) {
    throw new Error('Invalid profile id');
  }

  const currentPath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${currentId}.brf`);
  const metadata = await readBrouterProfileMetadata(currentPath, currentId);
  ensureOwnProfile(metadata, actor, currentId);

  const nextId = toProfileId(newName);
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(nextId)) {
    throw new Error('New profile name must produce a valid id (3-49 chars, a-z, 0-9, -)');
  }

  const currentContent = await fs.readFile(currentPath, 'utf8');
  const nextContent = rewriteProfileHeaderName(currentContent, newName);

  if (nextId !== currentId) {
    const targetPath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${nextId}.brf`);
    try {
      await fs.access(targetPath);
      throw new Error(`Profile already exists: ${nextId}`);
    } catch (error) {
      if (!(error && error.code === 'ENOENT')) {
        throw error;
      }
    }
    await fs.writeFile(targetPath, nextContent, 'utf8');
    await fs.unlink(currentPath);
  } else {
    await fs.writeFile(currentPath, nextContent, 'utf8');
  }

  return {
    id: nextId,
    label: newName,
    kind: inferBikeKind(nextId),
    source: 'brouter',
    owned: true
  };
}

async function deleteBikeProfile(profileId, actor = {}) {
  const id = String(profileId || '').trim();
  if (!id) {
    throw new Error('Profile id is required');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(id)) {
    throw new Error('Invalid profile id');
  }

  const filePath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${id}.brf`);
  const metadata = await readBrouterProfileMetadata(filePath, id);
  ensureOwnProfile(metadata, actor, id);
  await fs.unlink(filePath);
  return { id, deleted: true };
}

async function getBikeProfileContent(profileId, actor = {}) {
  const id = String(profileId || '').trim();
  if (!id) {
    throw new Error('Profile id is required');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(id)) {
    throw new Error('Invalid profile id');
  }

  const filePath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${id}.brf`);
  const metadata = await readBrouterProfileMetadata(filePath, id);
  ensureOwnProfile(metadata, actor, id);
  return {
    id,
    label: metadata.label,
    content: metadata.content,
    owned: true
  };
}

async function updateBikeProfileContent(profileId, nextContent, actor = {}) {
  const id = String(profileId || '').trim();
  if (!id) {
    throw new Error('Profile id is required');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(id)) {
    throw new Error('Invalid profile id');
  }

  const content = String(nextContent || '').trim();
  if (!content) {
    throw new Error('Profile content must not be empty');
  }
  if (content.length > 250000) {
    throw new Error('Profile content is too large');
  }

  const filePath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${id}.brf`);
  const metadata = await readBrouterProfileMetadata(filePath, id);
  ensureOwnProfile(metadata, actor, id);
  await fs.writeFile(filePath, `${content}\n`, 'utf8');
  return {
    id,
    label: metadata.label,
    owned: true
  };
}

function toProfileId(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 49);
}

async function readBrouterProfileMetadata(filePath, id) {
  const result = {
    label: titleCaseProfile(id.replace(/-/g, ' ')),
    ownerToken: '',
    content: ''
  };

  try {
    const content = await fs.readFile(filePath, 'utf8');
    result.content = content;
    const firstComment = content
      .split('\n')
      .map(line => line.replace(/^#\s*/, '').trim())
      .find(line => line && !line.endsWith('.brf'));

    const ownerLine = content
      .split('\n')
      .map(line => line.trim())
      .find(line => /^#\s*Created by:/i.test(line));
    if (ownerLine) {
      result.ownerToken = ownerLine.replace(/^#\s*Created by:\s*/i, '').trim();
    }

    if (firstComment) {
      const match = firstComment.match(/for (?:a |an )?(.+?)(?: bike|\.|$)/i);
      if (match && match[1]) {
        result.label = titleCaseProfile(match[1]);
        return result;
      }

      result.label = firstComment;
      return result;
    }
  } catch (_) {
    // Fall through to filename label.
  }

  return result;
}

function profileOwnerToken(actor = {}) {
  return String(actor.preferred_username || actor.sub || actor.name || 'unknown').trim();
}

function isProfileOwnedByActor(metadata = {}, actor = {}) {
  const ownerToken = String(metadata.ownerToken || '').trim();
  if (!ownerToken) {
    return false;
  }

  const actorTokens = [
    actor.preferred_username,
    actor.sub,
    actor.name,
    actor.email
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return actorTokens.includes(ownerToken);
}

function ensureOwnProfile(metadata = {}, actor = {}, profileId = '') {
  if (!isProfileOwnedByActor(metadata, actor)) {
    throw new Error(`Not allowed to modify profile: ${profileId}`);
  }
}

function rewriteProfileHeaderName(content, newName) {
  const lines = String(content || '').split('\n');
  if (lines.length && /^#\s*/.test(lines[0])) {
    lines[0] = `# ${newName}`;
  } else {
    lines.unshift(`# ${newName}`);
  }
  return lines.join('\n');
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

async function applyTempoAdjustments(route) {
  if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
    return route;
  }

  const baseDuration = Number(route.duration) || 0;
  const baseDistance = Number(route.distance) || computePolylineDistanceMeters(route.geometry.coordinates);
  if (baseDuration <= 0 || baseDistance <= 0) {
    return route;
  }

  const friction = route._routeFriction || computeRouteFriction(route);
  const frictionDelaySeconds = computeFrictionDelaySeconds(friction, baseDistance);
  const wind = await loadWindForRoute(route.geometry.coordinates);
  const weatherAlerts = assessWeatherAlerts(route.geometry.coordinates, wind);
  const windFactor = wind
    ? computeWindDurationFactor(route.geometry.coordinates, baseDuration, wind)
    : 1;
  const durationAfterFriction = baseDuration + frictionDelaySeconds;
  const adjustedDuration = Math.max(1, Math.round(durationAfterFriction * windFactor));
  const windEffectSeconds = adjustedDuration - durationAfterFriction;

  if (route.legs && route.legs[0]) {
    route.legs = route.legs.map((leg, index) => (
      index === 0 ? { ...leg, duration: adjustedDuration } : leg
    ));
  }

  return {
    ...route,
    duration: adjustedDuration,
    weatherAlerts,
    tempoFactors: {
      baseDuration: Math.round(baseDuration),
      adjustedDuration,
      frictionDelaySeconds: Math.round(frictionDelaySeconds),
      windEffectSeconds: Math.round(windEffectSeconds),
      delaySeconds: Math.round(frictionDelaySeconds),
      windDurationFactor: Number(windFactor.toFixed(3)),
      avgSpeedKmh: Number(((baseDistance / adjustedDuration) * 3.6).toFixed(1)),
      crossings: friction.crossings,
      trafficSignals: friction.trafficSignals,
      stopOrGiveWay: friction.stopOrGiveWay,
      majorTurns: friction.majorTurns,
      wind
    }
  };
}

function computeFrictionDelaySeconds(friction = {}, distanceMeters = 0) {
  const distanceKm = Math.max(0.1, distanceMeters / 1000);
  const crossingDelay = Math.min(distanceKm * 2.4, (Number(friction.crossings) || 0) * 1.2);
  const signalDelay = (Number(friction.trafficSignals) || 0) * 8;
  const stopDelay = (Number(friction.stopOrGiveWay) || 0) * 5;
  const turnDelay = (Number(friction.majorTurns) || 0) * 2.5;
  return crossingDelay + signalDelay + stopDelay + turnDelay;
}

async function loadWindForRoute(coordinates) {
  if (!WIND_SPEED_ENABLED || !Array.isArray(coordinates) || !coordinates.length) {
    return null;
  }

  const midpoint = coordinates[Math.floor(coordinates.length / 2)];
  if (!Array.isArray(midpoint)) {
    return null;
  }

  const lat = Number(midpoint[1]);
  const lon = Number(midpoint[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const cacheKey = `wind:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const cached = await getCachedJson('weather', cacheKey, 20 * 60 * 1000);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.get(WIND_API, {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation,weather_code,uv_index',
        wind_speed_unit: 'kmh'
      },
      timeout: 3500
    });
    const current = response.data && response.data.current ? response.data.current : {};
    const wind = {
      speedKmh: Math.max(0, Number(current.wind_speed_10m) || 0),
      directionDeg: normalizeDegrees(Number(current.wind_direction_10m) || 0),
      directionLabel: degreesToCompass(Number(current.wind_direction_10m) || 0),
      gustKmh: Math.max(0, Number(current.wind_gusts_10m) || 0),
      temperatureC: Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null,
      precipitationMm: Math.max(0, Number(current.precipitation) || 0),
      uvIndex: Number.isFinite(Number(current.uv_index)) ? Number(current.uv_index) : null,
      weatherCode: Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null,
      source: 'open-meteo'
    };
    await setCachedJson('weather', cacheKey, wind);
    return wind;
  } catch (error) {
    logOptionalLookupFailure('Wind', error);
    return null;
  }
}

function assessWeatherAlerts(coordinates, weather) {
  if (!weather || !Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const windSpeedKmh = Number(weather.speedKmh) || 0;
  const gustKmh = Number(weather.gustKmh) || 0;
  const temperatureC = Number.isFinite(Number(weather.temperatureC)) ? Number(weather.temperatureC) : null;
  const precipitationMm = Number(weather.precipitationMm) || 0;
  const uvIndex = Number.isFinite(Number(weather.uvIndex)) ? Number(weather.uvIndex) : null;
  const crosswindKmh = estimateRouteCrosswindKmh(coordinates, Number(weather.directionDeg) || 0, windSpeedKmh);

  const rainSeverity = precipitationMm >= 4 ? 'high' : precipitationMm >= 1 ? 'moderate' : null;
  const stormSeverity = gustKmh >= 75 || windSpeedKmh >= 60
    ? 'high'
    : gustKmh >= 60 || windSpeedKmh >= 45
      ? 'moderate'
      : null;
  const heatSeverity = temperatureC !== null && temperatureC >= 35
    ? 'high'
    : temperatureC !== null && temperatureC >= 30
      ? 'moderate'
      : null;
  const uvSeverity = uvIndex !== null && uvIndex >= 8
    ? 'high'
    : uvIndex !== null && uvIndex >= 6
      ? 'moderate'
      : null;
  const sidewindSeverity = crosswindKmh >= 30
    ? 'high'
    : crosswindKmh >= 20
      ? 'moderate'
      : null;

  const alerts = {
    rain: {
      active: Boolean(rainSeverity),
      severity: rainSeverity,
      precipitationMm: Number(precipitationMm.toFixed(1))
    },
    storm: {
      active: Boolean(stormSeverity),
      severity: stormSeverity,
      windKmh: Math.round(windSpeedKmh),
      gustKmh: Math.round(gustKmh)
    },
    heat: {
      active: Boolean(heatSeverity),
      severity: heatSeverity,
      temperatureC: temperatureC === null ? null : Number(temperatureC.toFixed(1))
    },
    uv: {
      active: Boolean(uvSeverity),
      severity: uvSeverity,
      uvIndex: uvIndex === null ? null : Number(uvIndex.toFixed(1))
    },
    sidewind: {
      active: Boolean(sidewindSeverity),
      severity: sidewindSeverity,
      crosswindKmh: Number(crosswindKmh.toFixed(1)),
      windDirectionLabel: weather.directionLabel || degreesToCompass(Number(weather.directionDeg) || 0)
    }
  };

  const activeCount = Object.values(alerts).filter((entry) => entry && entry.active).length;

  return {
    allClear: activeCount === 0,
    activeCount,
    measuredAt: new Date().toISOString(),
    source: weather.source || 'open-meteo',
    alerts
  };
}

function estimateRouteCrosswindKmh(coordinates, windFromDirectionDeg, windSpeedKmh) {
  const speed = Math.max(0, Number(windSpeedKmh) || 0);
  if (!speed || !Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  const sample = sampleRouteCoordinates(coordinates, 120);
  let weightedCrosswind = 0;
  let totalKm = 0;

  for (let i = 1; i < sample.length; i++) {
    const prev = sample[i - 1];
    const curr = sample[i];
    const segmentKm = getDistanceFromLatLon(prev[1], prev[0], curr[1], curr[0]);
    if (segmentKm <= 0) {
      continue;
    }

    const routeBearing = bearingDegrees([prev[1], prev[0]], [curr[1], curr[0]]);
    const angle = smallestAngleDegrees(routeBearing, normalizeDegrees(windFromDirectionDeg));
    const crosswind = Math.abs(speed * Math.sin(angle * Math.PI / 180));
    weightedCrosswind += crosswind * segmentKm;
    totalKm += segmentKm;
  }

  if (!totalKm) {
    return 0;
  }

  return weightedCrosswind / totalKm;
}

function computeWindDurationFactor(coordinates, baseDuration, wind) {
  const windSpeedKmh = Number(wind && wind.speedKmh) || 0;
  if (!windSpeedKmh || !Array.isArray(coordinates) || coordinates.length < 2) {
    return 1;
  }

  const baseSpeedKmh = Math.max(10, Math.min(42, (computePolylineDistanceMeters(coordinates) / Math.max(baseDuration, 1)) * 3.6));
  const sample = sampleRouteCoordinates(coordinates, 100);
  let weightedFactor = 0;
  let totalKm = 0;

  for (let i = 1; i < sample.length; i++) {
    const prev = sample[i - 1];
    const curr = sample[i];
    const segmentKm = getDistanceFromLatLon(prev[1], prev[0], curr[1], curr[0]);
    if (segmentKm <= 0) {
      continue;
    }

    const routeBearing = bearingDegrees([prev[1], prev[0]], [curr[1], curr[0]]);
    const windFromDirection = normalizeDegrees(Number(wind.directionDeg) || 0);
    const angle = smallestAngleDegrees(routeBearing, windFromDirection);
    const headwindKmh = windSpeedKmh * Math.cos(angle * Math.PI / 180);
    const effectiveSpeed = Math.max(8, baseSpeedKmh - headwindKmh * 0.28);
    const segmentFactor = baseSpeedKmh / effectiveSpeed;
    weightedFactor += segmentFactor * segmentKm;
    totalKm += segmentKm;
  }

  if (!totalKm) {
    return 1;
  }

  return Math.max(0.92, Math.min(1.22, weightedFactor / totalKm));
}

function computeRouteFriction(route = {}) {
  const friction = { crossings: 0, trafficSignals: 0, stopOrGiveWay: 0, majorTurns: 0 };
  const legs = Array.isArray(route.legs) ? route.legs : [];

  for (const leg of legs) {
    const steps = Array.isArray(leg.steps) ? leg.steps : [];
    for (const step of steps) {
      const maneuverType = String(step.maneuver && step.maneuver.type || '');
      const modifier = String(step.maneuver && step.maneuver.modifier || '');
      if (/turn|fork|end of road|roundabout/.test(maneuverType) || /sharp|left|right/.test(modifier)) {
        friction.majorTurns += 1;
      }
      const intersections = Array.isArray(step.intersections) ? step.intersections : [];
      for (const intersection of intersections) {
        if (Array.isArray(intersection.entry) && intersection.entry.length >= 3) {
          friction.crossings += 1;
        }
      }
    }
  }

  return friction;
}

function computeBrouterRouteFriction(messages) {
  const friction = { crossings: 0, trafficSignals: 0, stopOrGiveWay: 0, majorTurns: 0 };
  if (!Array.isArray(messages) || messages.length < 2) {
    return friction;
  }

  const [header, ...rows] = messages;
  const turnIdx = header.indexOf('TurnCost');
  const nodeIdx = header.indexOf('NodeTags');

  for (const row of rows) {
    const nodeTags = nodeIdx >= 0 ? String(row[nodeIdx] || '') : '';
    const turnCost = turnIdx >= 0 ? Number(row[turnIdx]) || 0 : 0;
    if (/crossing=|highway=crossing/.test(nodeTags)) {
      friction.crossings += 1;
    }
    if (/traffic_signals/.test(nodeTags)) {
      friction.trafficSignals += 1;
    }
    if (/give_way|stop/.test(nodeTags)) {
      friction.stopOrGiveWay += 1;
    }
    if (turnCost > 45) {
      friction.majorTurns += 1;
    }
  }

  return friction;
}

async function requestRoute(profile, points, options = {}) {
  let fellBackFromBrouter = false;
  let brouterFallbackReason = null;

  if (ROUTING_ENGINE === 'brouter') {
    try {
      return await requestRouteBrouter(points, options);
    } catch (error) {
      const reason = error.message || 'unknown error';
      if (!BROUTER_FALLBACK_TO_OSRM) {
        throw new Error(`BRouter failed: ${reason}`);
      }

      console.warn(`BRouter failed, falling back to OSRM: ${reason}`);
      fellBackFromBrouter = true;
      brouterFallbackReason = reason;
    }
  }

  const safeProfile = sanitizeOsrmProfile(profile);
  const url = buildOsrmRequestUrl(`route/v1/${safeProfile}`, points);
  const response = await axios.get(url, {
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
  const isProd = process.env.NODE_ENV === 'production';
  return {
    configuredEngine: ROUTING_ENGINE,
    ...(isProd ? {} : { osrmApi: OSRM_API, brouterApi: BROUTER_API }),
    brouterFallbackToOsrm: BROUTER_FALLBACK_TO_OSRM,
    optionalLookups: {
      railwaySafety: RAILWAY_SAFETY_ENABLED,
      preferenceGuidance: PREFERENCE_GUIDANCE_ENABLED,
      cyclewayAffinity: CYCLEWAY_AFFINITY_ENABLED,
      windSpeed: WIND_SPEED_ENABLED
    }
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
  const { profile, cleanup } = await resolveBrouterProfileForRequest(options);

  try {
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
  } finally {
    if (typeof cleanup === 'function') {
      await cleanup();
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
  const cleanRoutes = options.skipShapeFilter
    ? sortedRoutes
    : sortedRoutes.filter((route) => {
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
    _maxOutAndBackKm: shapeScore.maxOutAndBackKm,
    _routeFriction: computeRouteFriction(route)
  };
}

async function ensureBrouterSegments(points) {
  if (!BROUTER_AUTO_FETCH_SEGMENTS) {
    return;
  }

  // Only auto-fetch for local/container BRouter setups to avoid touching remote servers.
  if (!/localhost|127\.0\.0\.1|host\.docker\.internal|\/\/brouter(?::|\/|$)/i.test(BROUTER_API)) {
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

async function resolveBrouterProfileForRequest(options = {}) {
  const profile = resolveBrouterProfile(options);
  const overrides = getBrouterRiderOverrides(options.riderProfile || {});

  if (!overrides) {
    return { profile, cleanup: null };
  }

  const sourcePath = await findBrouterProfilePath(profile);
  if (!(await fileExists(sourcePath))) {
    return { profile, cleanup: null };
  }

  const source = await fs.readFile(sourcePath, 'utf8');
  const sourceMass = extractAssignedNumber(source, 'totalMass');
  const sourceRiderWeight = extractRiderWeightHint(source);
  const fallbackBikeMass = 10;
  const inferredBikeMass = Number.isFinite(sourceMass) && Number.isFinite(sourceRiderWeight)
    ? sourceMass - sourceRiderWeight
    : fallbackBikeMass;
  const bikeMass = clampNumber(inferredBikeMass, 6, 25);
  const adjustedMass = Number((overrides.riderWeight + bikeMass).toFixed(1));

  const withPower = upsertAssignedNumber(source, 'bikerPower', overrides.bikerPower);
  const adjusted = upsertAssignedNumber(withPower, 'totalMass', adjustedMass);

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempProfile = `${profile}-rt-${requestId}`;
  const tempPath = path.join(BROUTER_CUSTOM_PROFILES_DIR, `${tempProfile}.brf`);
  await fs.writeFile(tempPath, adjusted, { encoding: 'utf8', flag: 'wx' });

  return {
    profile: tempProfile,
    cleanup: async () => {
      try {
        await fs.unlink(tempPath);
      } catch (_) {
        // Ignore cleanup errors for temp profile removal.
      }
    }
  };
}

function getBrouterRiderOverrides(riderProfile = {}) {
  const ftp = Number(riderProfile.ftp);
  const weight = Number(riderProfile.weight);

  if (!Number.isFinite(ftp) || ftp <= 0 || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  const riderWeight = clampNumber(weight, 30, 180);
  // Approximation of sustainable power for routing speed model.
  const bikerPower = clampNumber(Math.round(ftp * 0.72), 80, 420);

  return { riderWeight, bikerPower };
}

async function findBrouterProfilePath(profileId) {
  for (const profileDir of getBrouterProfileDirs()) {
    const filePath = path.join(profileDir, `${profileId}.brf`);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }

  return path.join(BROUTER_CUSTOM_PROFILES_DIR, `${profileId}.brf`);
}

function extractAssignedNumber(content, variableName) {
  const re = new RegExp(`^\\s*assign\\s+${variableName}\\s*=?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$`, 'im');
  const match = String(content || '').match(re);
  return match ? Number(match[1]) : Number.NaN;
}

function extractRiderWeightHint(content) {
  const match = String(content || '').match(/Rider:\s*([0-9]+(?:\.[0-9]+)?)\s*kg/i);
  return match ? Number(match[1]) : Number.NaN;
}

function upsertAssignedNumber(content, variableName, value) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return String(content || '');
  }

  const line = `assign ${variableName} = ${next}`;
  const source = String(content || '');
  const re = new RegExp(`^\\s*assign\\s+${variableName}\\s*=?.*$`, 'im');
  if (re.test(source)) {
    return source.replace(re, line);
  }

  const globalMarker = '---context:way';
  const idx = source.indexOf(globalMarker);
  if (idx >= 0) {
    return `${source.slice(0, idx).trimEnd()}\n${line}\n\n${source.slice(idx)}`;
  }

  return `${source.trimEnd()}\n${line}\n`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
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
  const routeFriction = computeBrouterRouteFriction(props.messages);

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
    _maxOutAndBackKm: shapeScore.maxOutAndBackKm,
    _routeFriction: routeFriction
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
    apiList: OVERPASS_API_LIST,
    query
  };
  const cached = await getCachedJson(`overpass-${cacheNamespace}`, cacheKey, OVERPASS_CACHE_TTL_MS);
  if (cached && Array.isArray(cached.elements)) {
    return cached.elements;
  }

  let lastError = null;
  for (let index = 0; index < OVERPASS_API_LIST.length; index += 1) {
    const overpassApi = OVERPASS_API_LIST[index];
    try {
      const response = await axios.get(overpassApi, {
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

      await setCachedJson(`overpass-${cacheNamespace}`, cacheKey, { elements, overpassApi });
      return elements;
    } catch (error) {
      lastError = error;
      const canTryNext = shouldTryNextOverpassEndpoint(error);
      const hasAlternative = index < OVERPASS_API_LIST.length - 1;
      if (!canTryNext || !hasAlternative) {
        break;
      }
      if (DEBUG_OPTIONAL_LOOKUPS) {
        console.warn(`Overpass endpoint failed (${overpassApi}), trying next endpoint...`);
      }
    }
  }

  if (lastError) {
    lastError.message = `${lastError.message || 'Overpass request failed'} (endpoints: ${OVERPASS_API_LIST.join(', ')})`;
    throw lastError;
  }

  throw new Error(`Overpass request failed (endpoints: ${OVERPASS_API_LIST.join(', ')})`);
}

function shouldTryNextOverpassEndpoint(error) {
  if (!error) {
    return false;
  }

  const code = String(error.code || '').toUpperCase();
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const status = Number(error.response && error.response.status);
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
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
  const message = formatOptionalLookupError(error);
  const isTimeout = isOptionalLookupTimeout(error, message);

  if (!isTimeout || DEBUG_OPTIONAL_LOOKUPS) {
    console.warn(`${label} lookup failed:`, message);
  }
}

function isOptionalLookupTimeout(error, message = '') {
  const code = String(error && error.code ? error.code : '').toUpperCase();
  const status = Number(error && error.response && error.response.status);
  return code === 'ECONNABORTED'
    || code === 'ETIMEDOUT'
    || status === 504
    || /timeout/i.test(String(message || ''));
}

function formatOptionalLookupError(error) {
  if (!error) {
    return 'unknown error';
  }

  if (error.response) {
    const status = error.response.status;
    const bodyRaw = typeof error.response.data === 'string'
      ? error.response.data
      : JSON.stringify(error.response.data || {});
    const body = String(bodyRaw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    const code = String(error.code || '').trim();
    return `HTTP ${status}${code ? ` ${code}` : ''}${body ? ` ${body}` : ''}`;
  }

  if (error.request && (error.code || error.message)) {
    const code = String(error.code || '').trim();
    const msg = String(error.message || '').trim();
    return `${code || 'REQUEST_ERROR'}${msg ? ` ${msg}` : ''}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return String(error.message);
  }

  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : 'unknown error';
  } catch (_) {
    return 'unknown error';
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

function pickBrouterFallbackRoute(candidates) {
  if (ROUTING_ENGINE !== 'brouter' || !Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  return candidates
    .slice()
    .sort((a, b) => {
      const aPenalty = getRouteShapePenalty(a);
      const bPenalty = getRouteShapePenalty(b);
      const aDistance = Number(a && a.distance) || Number.POSITIVE_INFINITY;
      const bDistance = Number(b && b.distance) || Number.POSITIVE_INFINITY;
      return aPenalty - bPenalty || aDistance - bDistance;
    })[0] || null;
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

function normalizeDegrees(value) {
  let out = Number(value) % 360;
  if (out < 0) out += 360;
  return out;
}

function degreesToCompass(value) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(normalizeDegrees(value) / 45) % labels.length;
  return labels[index];
}

function smallestAngleDegrees(a, b) {
  let diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  if (diff > 180) diff = 360 - diff;
  return diff;
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
    const url = buildOsrmRequestUrl('match/v1/cycling', coordinates);

    const response = await axios.get(
      url,
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
  createBikeProfile,
  renameBikeProfile,
  deleteBikeProfile,
  getBikeProfileContent,
  updateBikeProfileContent,
  analyzeRoute,
  getRoutingEngineInfo,
  PROFILES,
  PREFERENCE_PROFILES
};
