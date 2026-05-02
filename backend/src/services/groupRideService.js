const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const GROUP_RIDES_DIR = process.env.ROUTESHRED_GROUP_RIDES_DIR
  || path.resolve(__dirname, '../../../data/group-rides');

function normalizeSub(sub) {
  return String(sub || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
}

function ownerDir(sub) {
  return path.join(GROUP_RIDES_DIR, normalizeSub(sub));
}

async function ensureOwnerDir(sub) {
  const dir = ownerDir(sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function ridePath(sub, rideId) {
  return path.join(ownerDir(sub), `${normalizeId(rideId)}.json`);
}

function sanitizeVisibility(value) {
  return value === 'public' ? 'public' : 'private';
}

function sanitizeChallenge(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'social';
  }
  return normalized.slice(0, 40);
}

function sanitizePayload(payload = {}) {
  const now = new Date().toISOString();
  const title = String(payload.title || '').trim().slice(0, 120) || `Group Ride ${now.slice(0, 10)}`;
  const startAtRaw = String(payload.startAt || '').trim();
  const parsed = Date.parse(startAtRaw);
  const startAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';

  return {
    title,
    description: String(payload.description || '').trim().slice(0, 1200),
    challenge: sanitizeChallenge(payload.challenge),
    photoUrl: String(payload.photoUrl || '').trim().slice(0, 600),
    instagramUrl: String(payload.instagramUrl || '').trim().slice(0, 600),
    meetingPoint: String(payload.meetingPoint || '').trim().slice(0, 240),
    startAt,
    visibility: sanitizeVisibility(payload.visibility),
    routeId: String(payload.routeId || '').trim().slice(0, 80),
    routeOwnerSub: String(payload.routeOwnerSub || '').trim().slice(0, 120),
    routeName: String(payload.routeName || '').trim().slice(0, 120),
    updatedAt: now
  };
}

function sanitizeParticipantList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const list = [];
  value.forEach((entry) => {
    const sub = normalizeSub(entry && entry.sub);
    if (!sub || list.some((item) => item.sub === sub)) {
      return;
    }

    list.push({
      sub,
      name: String((entry && entry.name) || sub).trim().slice(0, 120) || sub,
      joinedAt: String((entry && entry.joinedAt) || new Date().toISOString())
    });
  });

  return list.slice(0, 200);
}

function sanitizeComments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const authorSub = normalizeSub(entry && entry.authorSub);
      const text = String((entry && entry.text) || '').trim().slice(0, 500);
      if (!authorSub || !text) {
        return null;
      }

      return {
        id: normalizeId(entry.id) || crypto.randomUUID(),
        authorSub,
        authorName: String((entry && entry.authorName) || authorSub).trim().slice(0, 120) || authorSub,
        text,
        createdAt: String((entry && entry.createdAt) || new Date().toISOString())
      };
    })
    .filter(Boolean)
    .slice(-100);
}

function getDisplayName(user = {}) {
  return user.name || user.preferred_username || user.email || 'Rider';
}

function summarize(ride) {
  return {
    id: ride.id,
    ownerSub: ride.ownerSub,
    ownerName: ride.ownerName,
    access: ride.access || 'own',
    canEdit: Boolean(ride.canEdit),
    title: ride.title,
    description: ride.description,
    challenge: ride.challenge,
    photoUrl: ride.photoUrl,
    instagramUrl: ride.instagramUrl || '',
    meetingPoint: ride.meetingPoint,
    startAt: ride.startAt,
    visibility: sanitizeVisibility(ride.visibility),
    participantsCount: Array.isArray(ride.participants) ? ride.participants.length : 0,
    participants: sanitizeParticipantList(ride.participants).slice(0, 12),
    comments: sanitizeComments(ride.comments).slice(-25),
    isJoined: Boolean(ride.isJoined),
    routeId: ride.routeId || '',
    routeOwnerSub: ride.routeOwnerSub || '',
    routeName: ride.routeName || '',
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt
  };
}

function annotate(ride, currentSub) {
  const cleanCurrentSub = normalizeSub(currentSub);
  const cleanOwnerSub = normalizeSub(ride.ownerSub);
  const isOwner = cleanCurrentSub && cleanCurrentSub === cleanOwnerSub;
  const visibility = sanitizeVisibility(ride.visibility);
  const access = isOwner ? 'own' : (visibility === 'public' ? 'public' : 'private');
  const participants = sanitizeParticipantList(ride.participants);
  const comments = sanitizeComments(ride.comments);
  const isJoined = Boolean(cleanCurrentSub && participants.some((entry) => entry.sub === cleanCurrentSub));

  return {
    ...ride,
    ownerSub: cleanOwnerSub,
    visibility,
    participants,
    comments,
    isJoined,
    access,
    canEdit: isOwner
  };
}

async function writeRide(ownerSub, ride) {
  await ensureOwnerDir(ownerSub);
  await fs.writeFile(ridePath(ownerSub, ride.id), JSON.stringify(ride, null, 2), 'utf8');
}

async function mutateVisibleRide(currentSub, ownerSub, rideId, mutator) {
  const owner = normalizeSub(ownerSub || currentSub);
  const existing = await readRide(owner, rideId);
  if (!existing) {
    return null;
  }

  const annotated = annotate(existing, currentSub);
  if (annotated.access === 'private' && !annotated.canEdit) {
    return null;
  }

  const next = await mutator({ ...existing, participants: annotated.participants, comments: annotated.comments }, annotated);
  if (!next) {
    return summarize(annotate(existing, currentSub));
  }

  const updatedRide = {
    ...next,
    id: existing.id,
    ownerSub: existing.ownerSub,
    ownerName: existing.ownerName,
    participants: sanitizeParticipantList(next.participants),
    comments: sanitizeComments(next.comments),
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt
  };

  await writeRide(owner, updatedRide);
  return summarize(annotate(updatedRide, currentSub));
}

async function readRide(ownerSub, rideId) {
  const id = normalizeId(rideId);
  if (!id) {
    return null;
  }

  try {
    const raw = await fs.readFile(ridePath(ownerSub, id), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function readVisibleRide(currentSub, ownerSub, rideId) {
  const owner = normalizeSub(ownerSub || currentSub);
  const ride = await readRide(owner, rideId);
  if (!ride) {
    return null;
  }

  const annotated = annotate(ride, currentSub);
  if (annotated.access === 'private' && !annotated.canEdit) {
    return null;
  }

  return summarize(annotated);
}

async function listVisibleRides(currentSub) {
  await fs.mkdir(GROUP_RIDES_DIR, { recursive: true });

  const own = normalizeSub(currentSub);
  const dirs = new Set([own]);

  try {
    const entries = await fs.readdir(GROUP_RIDES_DIR, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory()) {
        dirs.add(entry.name);
      }
    });
  } catch (_) {
    // Ignore directory read errors.
  }

  const rides = [];
  for (const sub of dirs) {
    if (!sub) {
      continue;
    }

    let files = [];
    try {
      files = await fs.readdir(ownerDir(sub), { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }

      try {
        const raw = await fs.readFile(path.join(ownerDir(sub), file.name), 'utf8');
        const ride = JSON.parse(raw);
        const annotated = annotate(ride, own);
        if (annotated.access === 'private' && !annotated.canEdit) {
          continue;
        }
        rides.push(summarize(annotated));
      } catch (_) {
        // Ignore malformed files.
      }
    }
  }

  return rides.sort((a, b) => String(b.startAt || b.updatedAt || '').localeCompare(String(a.startAt || a.updatedAt || '')));
}

async function createOrUpdateRide(sub, payload = {}, user = {}) {
  const dir = await ensureOwnerDir(sub);
  const id = normalizeId(payload.id) || crypto.randomUUID();
  const existing = await readRide(sub, id);
  const sanitized = sanitizePayload(payload);

  const ride = {
    ...existing,
    ...sanitized,
    id,
    ownerSub: normalizeSub(sub),
    ownerName: existing && existing.ownerName ? existing.ownerName : getDisplayName(user),
    participants: sanitizeParticipantList(existing && existing.participants),
    comments: sanitizeComments(existing && existing.comments),
    createdAt: existing && existing.createdAt ? existing.createdAt : sanitized.updatedAt
  };

  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(ride, null, 2), 'utf8');
  return summarize(annotate(ride, sub));
}

async function deleteRide(sub, rideId) {
  const id = normalizeId(rideId);
  if (!id) {
    return false;
  }

  try {
    await fs.unlink(ridePath(sub, id));
    return true;
  } catch (_) {
    return false;
  }
}

async function joinRide(currentSub, ownerSub, rideId, user = {}) {
  const sub = normalizeSub(currentSub);
  if (!sub) {
    return null;
  }

  return mutateVisibleRide(sub, ownerSub, rideId, (existing, annotated) => {
    const participants = sanitizeParticipantList(existing.participants);
    if (!participants.some((entry) => entry.sub === sub)) {
      participants.push({
        sub,
        name: getDisplayName(user),
        joinedAt: new Date().toISOString()
      });
    }
    return { ...existing, participants, comments: existing.comments, visibility: annotated.visibility };
  });
}

async function leaveRide(currentSub, ownerSub, rideId) {
  const sub = normalizeSub(currentSub);
  if (!sub) {
    return null;
  }

  return mutateVisibleRide(sub, ownerSub, rideId, (existing) => {
    const participants = sanitizeParticipantList(existing.participants).filter((entry) => entry.sub !== sub);
    return { ...existing, participants, comments: existing.comments };
  });
}

async function addRideComment(currentSub, ownerSub, rideId, text, user = {}) {
  const sub = normalizeSub(currentSub);
  const cleanText = String(text || '').trim().slice(0, 500);
  if (!sub || !cleanText) {
    return null;
  }

  return mutateVisibleRide(sub, ownerSub, rideId, (existing) => {
    const comments = sanitizeComments(existing.comments);
    comments.push({
      id: crypto.randomUUID(),
      authorSub: sub,
      authorName: getDisplayName(user),
      text: cleanText,
      createdAt: new Date().toISOString()
    });
    return { ...existing, comments, participants: existing.participants };
  });
}

module.exports = {
  listVisibleRides,
  readVisibleRide,
  createOrUpdateRide,
  deleteRide,
  joinRide,
  leaveRide,
  addRideComment
};
