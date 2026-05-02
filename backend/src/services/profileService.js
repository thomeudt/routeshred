const fs = require('fs/promises');
const path = require('path');
const { getKeycloakUsersByIds, searchKeycloakUsers } = require('./keycloakService');

const PROFILE_DIR = process.env.ROUTESHRED_PROFILE_DIR
  || path.resolve(__dirname, '../../../data/profiles');

function normalizeSub(sub) {
  return String(sub || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureProfileDir() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
}

function profilePathForSub(sub) {
  return path.join(PROFILE_DIR, `${normalizeSub(sub)}.json`);
}

function defaultProfileFromUser(user = {}) {
  return {
    riderProfile: {
      ftp: 250,
      weight: 87
    },
    bikeType: 'road',
    rideType: 'z2',
    displayName: user.name || user.preferred_username || 'Rider',
    email: user.email || '',
    preferred_username: user.preferred_username || ''
  };
}

async function readUserProfile(sub, userInfo = {}) {
  await ensureProfileDir();
  const filePath = profilePathForSub(sub);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      ...defaultProfileFromUser(userInfo),
      ...data
    };
  } catch (_) {
    const profile = defaultProfileFromUser(userInfo);
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2), { encoding: 'utf8', flag: 'wx' }).catch((error) => {
      if (error && error.code !== 'EEXIST') {
        throw error;
      }
    });
    return profile;
  }
}

function sanitizeProfilePayload(payload = {}) {
  const riderProfile = payload.riderProfile || {};
  const ftp = Number(riderProfile.ftp);
  const weight = Number(riderProfile.weight);

  return {
    riderProfile: {
      ftp: Number.isFinite(ftp) && ftp > 50 && ftp < 600 ? Math.round(ftp) : 250,
      weight: Number.isFinite(weight) && weight > 30 && weight < 250 ? Number(weight.toFixed(1)) : 87
    },
    bikeType: String(payload.bikeType || 'road'),
    rideType: String(payload.rideType || 'z2'),
    displayName: String(payload.displayName || '').slice(0, 80)
  };
}

async function writeUserProfile(sub, payload, userInfo = {}) {
  await ensureProfileDir();
  const merged = {
    ...defaultProfileFromUser(userInfo),
    ...sanitizeProfilePayload(payload)
  };

  const filePath = profilePathForSub(sub);
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

async function searchUserProfiles(query = '', currentSub = '') {
  await ensureProfileDir();
  const needle = String(query || '').trim().toLowerCase();
  const usersById = new Map();

  try {
    const keycloakUsers = await searchKeycloakUsers(query, currentSub);
    keycloakUsers.forEach((user) => {
      usersById.set(user.id, user);
    });
  } catch (_) {
    // Fall back to locally persisted profiles when Keycloak admin search is unavailable.
  }

  const entries = await fs.readdir(PROFILE_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const sub = entry.name.replace(/\.json$/i, '');
    if (sub === normalizeSub(currentSub)) {
      continue;
    }

    try {
      const raw = await fs.readFile(path.join(PROFILE_DIR, entry.name), 'utf8');
      const profile = JSON.parse(raw);
      const displayName = String(profile.displayName || sub).slice(0, 80);
      const email = String(profile.email || profile.preferred_username || '').slice(0, 180);
      const haystack = [sub, displayName, email].join(' ').toLowerCase();
      if (needle && !haystack.includes(needle)) {
        continue;
      }

      usersById.set(sub, {
        ...usersById.get(sub),
        id: sub,
        label: displayName,
        detail: email && email !== displayName ? email : sub
      });
    } catch (_) {
      // Ignore malformed profile files.
    }
  }

  return [...usersById.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 8);
}

async function resolveUserProfiles(ids = []) {
  await ensureProfileDir();
  const wanted = [...new Set(ids.map((id) => normalizeSub(id)).filter(Boolean))].slice(0, 50);
  const usersById = new Map();

  try {
    const keycloakUsers = await getKeycloakUsersByIds(wanted);
    keycloakUsers.forEach((user) => {
      usersById.set(user.id, user);
    });
  } catch (_) {
    // Fall back to locally persisted profiles.
  }

  for (const id of wanted) {
    try {
      const raw = await fs.readFile(path.join(PROFILE_DIR, `${id}.json`), 'utf8');
      const profile = JSON.parse(raw);
      const displayName = String(profile.displayName || id).slice(0, 80);
      const email = String(profile.email || profile.preferred_username || '').slice(0, 180);
      usersById.set(id, {
        ...usersById.get(id),
        id,
        label: displayName,
        detail: email && email !== displayName ? email : id
      });
    } catch (_) {
      if (!usersById.has(id)) {
        usersById.set(id, { id, label: id, detail: id });
      }
    }
  }

  return wanted.map((id) => usersById.get(id)).filter(Boolean);
}

module.exports = {
  readUserProfile,
  writeUserProfile,
  searchUserProfiles,
  resolveUserProfiles,
  sanitizeProfilePayload,
  defaultProfileFromUser
};
