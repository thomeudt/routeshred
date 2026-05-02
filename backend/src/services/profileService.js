const fs = require('fs/promises');
const path = require('path');

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
    displayName: user.name || user.preferred_username || 'Rider'
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
    return defaultProfileFromUser(userInfo);
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

module.exports = {
  readUserProfile,
  writeUserProfile,
  sanitizeProfilePayload,
  defaultProfileFromUser
};
