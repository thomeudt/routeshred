const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const SAVED_ROUTES_DIR = process.env.ROUTESHRED_ROUTES_DIR
  || path.resolve(__dirname, '../../../data/routes');

function normalizeSub(sub) {
  return String(sub || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeRouteId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
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
    route,
    returnRoute,
    distance: route && Number.isFinite(Number(route.distance)) ? Math.round(Number(route.distance)) : 0,
    duration: route && Number.isFinite(Number(route.duration)) ? Math.round(Number(route.duration)) : 0,
    updatedAt: now
  };
}

function summarizeSavedRoute(savedRoute) {
  return {
    id: savedRoute.id,
    name: savedRoute.name,
    startLabel: savedRoute.startLabel,
    endLabel: savedRoute.endLabel,
    distance: savedRoute.distance,
    duration: savedRoute.duration,
    bikeType: savedRoute.bikeType,
    preference: savedRoute.preference,
    rideType: savedRoute.rideType,
    createdAt: savedRoute.createdAt,
    updatedAt: savedRoute.updatedAt
  };
}

async function listSavedRoutes(sub) {
  const dir = await ensureUserRoutesDir(sub);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const raw = await fs.readFile(path.join(dir, entry.name), 'utf8');
      routes.push(summarizeSavedRoute(JSON.parse(raw)));
    } catch (_) {
      // Ignore malformed route files so one bad save cannot break the list.
    }
  }

  return routes.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

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

async function writeSavedRoute(sub, payload = {}) {
  const dir = await ensureUserRoutesDir(sub);
  const id = normalizeRouteId(payload.id) || crypto.randomUUID();
  const existing = await readSavedRoute(sub, id);
  const sanitized = sanitizeSavedRoutePayload(payload);
  const savedRoute = {
    ...sanitized,
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

module.exports = {
  listSavedRoutes,
  readSavedRoute,
  writeSavedRoute,
  deleteSavedRoute,
  renameSavedRoute
};
