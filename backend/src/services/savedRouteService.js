const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const SAVED_ROUTES_DIR = process.env.ROUTESHRED_ROUTES_DIR
  || path.resolve(__dirname, '../../../data/routes');
const PROFILE_DIR = process.env.ROUTESHRED_PROFILE_DIR
  || path.resolve(__dirname, '../../../data/profiles');

function normalizeSub(sub) {
  return String(sub || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeRouteId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
}

function getUserIdentifiers(user = {}) {
  return [
    user.sub,
    user.email,
    user.preferred_username,
    user.username,
    user.name
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function getDisplayName(user = {}) {
  return user.name || user.preferred_username || user.email || 'Rider';
}

async function getStoredDisplayName(sub) {
  const cleanSub = normalizeSub(sub);
  if (!cleanSub) {
    return '';
  }

  try {
    const raw = await fs.readFile(path.join(PROFILE_DIR, `${cleanSub}.json`), 'utf8');
    const profile = JSON.parse(raw);
    return String(profile.displayName || profile.name || profile.preferred_username || profile.email || '').trim();
  } catch (_) {
    return '';
  }
}

function sanitizeShareList(sharedWith) {
  if (!Array.isArray(sharedWith)) {
    return [];
  }

  return [...new Set(sharedWith
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50))]
    .map((value) => value.slice(0, 180));
}

function sanitizeVisibility(visibility) {
  return visibility === 'public' ? 'public' : 'private';
}

function userRoutesDir(sub) {
  return path.join(SAVED_ROUTES_DIR, normalizeSub(sub));
}

async function ensureUserRoutesDir(sub) {
  const dir = userRoutesDir(sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function routePathForSub(sub, routeId) {
  return path.join(userRoutesDir(sub), `${normalizeRouteId(routeId)}.json`);
}

function sanitizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }

  const lat = Number(point[0]);
  const lon = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return [lat, lon];
}

function sanitizeWaypoints(waypoints) {
  if (!Array.isArray(waypoints)) {
    return [];
  }

  return waypoints
    .map((waypoint) => {
      if (Array.isArray(waypoint)) {
        const point = sanitizePoint(waypoint);
        return point ? { point, label: '' } : null;
      }

      const point = sanitizePoint(waypoint && waypoint.point);
      if (!point) {
        return null;
      }

      return {
        id: String(waypoint.id || crypto.randomUUID()).slice(0, 80),
        point,
        label: String(waypoint.label || '').slice(0, 240)
      };
    })
    .filter(Boolean);
}

function sanitizeSavedRoutePayload(payload = {}) {
  const now = new Date().toISOString();
  const name = String(payload.name || '').trim().slice(0, 120) || `Route ${now.slice(0, 10)}`;
  const route = payload.route && typeof payload.route === 'object' ? payload.route : null;
  const returnRoute = payload.returnRoute && typeof payload.returnRoute === 'object' ? payload.returnRoute : null;

  return {
    name,
    description: String(payload.description || '').trim().slice(0, 500),
    startPoint: sanitizePoint(payload.startPoint),
    startLabel: String(payload.startLabel || '').slice(0, 240),
    endPoint: sanitizePoint(payload.endPoint),
    endLabel: String(payload.endLabel || '').slice(0, 240),
    waypoints: sanitizeWaypoints(payload.waypoints),
    bikeType: String(payload.bikeType || 'road').slice(0, 80),
    preference: String(payload.preference || 'scenic').slice(0, 40),
    rideType: String(payload.rideType || 'z2').slice(0, 40),
    riderProfile: {
      ftp: Number(payload.riderProfile && payload.riderProfile.ftp) || 250,
      weight: Number(payload.riderProfile && payload.riderProfile.weight) || 87
    },
    includeReturnTrip: Boolean(payload.includeReturnTrip),
    visibility: sanitizeVisibility(payload.visibility),
    sharedWith: sanitizeShareList(payload.sharedWith),
    route,
    returnRoute,
    distance: route && Number.isFinite(Number(route.distance)) ? Math.round(Number(route.distance)) : 0,
    duration: route && Number.isFinite(Number(route.duration)) ? Math.round(Number(route.duration)) : 0,
    updatedAt: now
  };
}

/**
 * @param {import('../types').SavedRoute} savedRoute
 * @returns {import('../types').SavedRouteSummary}
 */
function summarizeSavedRoute(savedRoute) {
  return {
    id: savedRoute.id,
    ownerSub: savedRoute.ownerSub,
    ownerName: savedRoute.ownerName,
    access: savedRoute.access || 'own',
    canEdit: Boolean(savedRoute.canEdit),
    name: savedRoute.name,
    startLabel: savedRoute.startLabel,
    endLabel: savedRoute.endLabel,
    distance: savedRoute.distance,
    duration: savedRoute.duration,
    bikeType: savedRoute.bikeType,
    preference: savedRoute.preference,
    rideType: savedRoute.rideType,
    visibility: sanitizeVisibility(savedRoute.visibility),
    sharedWith: sanitizeShareList(savedRoute.sharedWith),
    createdAt: savedRoute.createdAt,
    updatedAt: savedRoute.updatedAt
  };
}

function annotateSavedRoute(savedRoute, ownerSub, currentUser = {}, ownerDisplayName = '') {
  const currentSub = normalizeSub(currentUser.sub);
  const cleanOwnerSub = normalizeSub(savedRoute.ownerSub || ownerSub);
  const identifiers = getUserIdentifiers(currentUser);
  const sharedWith = sanitizeShareList(savedRoute.sharedWith);
  const visibility = sanitizeVisibility(savedRoute.visibility);
  const isOwner = cleanOwnerSub === currentSub;
  const isPublic = visibility === 'public';
  const isShared = sharedWith.some((identifier) => identifiers.includes(identifier));

  return {
    ...savedRoute,
    ownerSub: cleanOwnerSub,
    ownerName: savedRoute.ownerName || ownerDisplayName || cleanOwnerSub,
    visibility,
    sharedWith,
    access: isOwner ? 'own' : (isPublic ? 'public' : (isShared ? 'shared' : 'private')),
    canEdit: isOwner
  };
}

function canReadRoute(savedRoute, ownerSub, currentUser = {}) {
  const annotated = annotateSavedRoute(savedRoute, ownerSub, currentUser);
  return ['own', 'public', 'shared'].includes(annotated.access);
}

async function readRoutesForOwner(ownerSub, currentUser = {}) {
  const dir = userRoutesDir(ownerSub);
  let entries = [];
  const ownerDisplayName = await getStoredDisplayName(ownerSub);

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  const routes = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const raw = await fs.readFile(path.join(dir, entry.name), 'utf8');
      const route = JSON.parse(raw);
      const annotated = annotateSavedRoute(route, ownerSub, currentUser, ownerDisplayName);
      if (['own', 'public', 'shared'].includes(annotated.access)) {
        routes.push(summarizeSavedRoute(annotated));
      }
    } catch (_) {
      // Ignore malformed route files so one bad save cannot break the list.
    }
  }

  return routes;
}

/**
 * @param {string} sub - current user's Keycloak sub
 * @param {import('../types').KeycloakUser} [user]
 * @returns {Promise<import('../types').SavedRouteSummary[]>}
 */
async function listSavedRoutes(sub, user = {}) {
  await ensureUserRoutesDir(sub);
  let ownerDirs = [];

  try {
    ownerDirs = await fs.readdir(SAVED_ROUTES_DIR, { withFileTypes: true });
  } catch (_) {
    ownerDirs = [];
  }

  const routes = [];
  const ownSub = normalizeSub(sub);
  const ownerNames = new Set([ownSub]);
  ownerDirs.forEach((entry) => {
    if (entry.isDirectory()) {
      ownerNames.add(entry.name);
    }
  });

  for (const ownerSub of ownerNames) {
    routes.push(...await readRoutesForOwner(ownerSub, { ...user, sub }));
  }

  return routes.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/**
 * @param {string} sub
 * @param {string} routeId
 * @returns {Promise<import('../types').SavedRoute|null>}
 */
async function readSavedRoute(sub, routeId) {
  const id = normalizeRouteId(routeId);
  if (!id) {
    return null;
  }

  try {
    const raw = await fs.readFile(routePathForSub(sub, id), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} currentSub
 * @param {string} ownerSub
 * @param {string} routeId
 * @param {import('../types').KeycloakUser} [user]
 * @returns {Promise<import('../types').SavedRoute|null>}
 */
async function readVisibleSavedRoute(currentSub, ownerSub, routeId, user = {}) {
  const owner = normalizeSub(ownerSub || currentSub);
  const route = await readSavedRoute(owner, routeId);
  if (!route || !canReadRoute(route, owner, { ...user, sub: currentSub })) {
    return null;
  }

  return annotateSavedRoute(route, owner, { ...user, sub: currentSub }, await getStoredDisplayName(owner));
}

/**
 * @param {string} sub
 * @param {Partial<import('../types').SavedRoute>} payload
 * @param {import('../types').KeycloakUser} [user]
 * @returns {Promise<import('../types').SavedRoute>}
 */
async function writeSavedRoute(sub, payload = {}, user = {}) {
  const dir = await ensureUserRoutesDir(sub);
  const id = normalizeRouteId(payload.id) || crypto.randomUUID();
  const existing = await readSavedRoute(sub, id);
  const sanitized = sanitizeSavedRoutePayload(payload);
  const savedRoute = {
    ...sanitized,
    visibility: existing && existing.visibility ? existing.visibility : sanitized.visibility,
    sharedWith: existing && Array.isArray(existing.sharedWith) ? existing.sharedWith : sanitized.sharedWith,
    ownerSub: normalizeSub(sub),
    ownerName: existing && existing.ownerName ? existing.ownerName : getDisplayName(user),
    id,
    createdAt: existing && existing.createdAt ? existing.createdAt : sanitized.updatedAt
  };

  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(savedRoute, null, 2), 'utf8');
  return savedRoute;
}

async function deleteSavedRoute(sub, routeId) {
  const id = normalizeRouteId(routeId);
  if (!id) {
    return false;
  }

  try {
    await fs.unlink(routePathForSub(sub, id));
    return true;
  } catch (_) {
    return false;
  }
}

async function renameSavedRoute(sub, routeId, name) {
  const existing = await readSavedRoute(sub, routeId);
  if (!existing) {
    return null;
  }

  const cleanName = String(name || '').trim().slice(0, 120);
  if (!cleanName) {
    return existing;
  }

  const renamed = {
    ...existing,
    name: cleanName,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(routePathForSub(sub, existing.id), JSON.stringify(renamed, null, 2), 'utf8');
  return renamed;
}

async function updateSavedRouteSharing(sub, routeId, payload = {}) {
  const existing = await readSavedRoute(sub, routeId);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    visibility: payload.visibility === undefined
      ? sanitizeVisibility(existing.visibility)
      : sanitizeVisibility(payload.visibility),
    sharedWith: payload.sharedWith === undefined
      ? sanitizeShareList(existing.sharedWith)
      : sanitizeShareList(payload.sharedWith),
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(routePathForSub(sub, updated.id), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

module.exports = {
  listSavedRoutes,
  readSavedRoute,
  readVisibleSavedRoute,
  writeSavedRoute,
  deleteSavedRoute,
  renameSavedRoute,
  updateSavedRouteSharing
};
