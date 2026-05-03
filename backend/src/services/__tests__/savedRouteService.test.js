'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs/promises');

let tmpDir;
let service;

const OWNER = { sub: 'owner-abc-123', email: 'owner@example.com', preferred_username: 'owner' };
const STRANGER = { sub: 'stranger-xyz', email: 'stranger@example.com' };
const SHARED_USER = { sub: 'shared-user-456', email: 'friend@example.com' };

const BASE_PAYLOAD = {
  name: 'Morning Loop',
  startPoint: [48.5, 9.0],
  startLabel: 'Tübingen HBF',
  endPoint: [48.6, 9.1],
  endLabel: 'Herrenberg',
  bikeType: 'road',
  preference: 'scenic',
  rideType: 'z2',
  riderProfile: { ftp: 250, weight: 75 },
  route: {
    geometry: { coordinates: [[9.0, 48.5, 400], [9.1, 48.6, 450]] },
    distance: 12000,
    duration: 3600,
  },
  visibility: 'private',
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'routeshred-test-'));
  jest.resetModules();
  process.env.ROUTESHRED_ROUTES_DIR = tmpDir;
  process.env.ROUTESHRED_PROFILE_DIR = tmpDir;
  service = require('../savedRouteService');
});

afterAll(async () => {
  delete process.env.ROUTESHRED_ROUTES_DIR;
  delete process.env.ROUTESHRED_PROFILE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── write / read round-trip ──────────────────────────────────────────────────

describe('writeSavedRoute / readSavedRoute round-trip', () => {
  it('persists a route and reads it back with correct fields', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, BASE_PAYLOAD, OWNER);
    expect(saved.name).toBe('Morning Loop');
    expect(saved.ownerSub).toBe('owner-abc-123');
    expect(saved.id).toBeTruthy();

    const read = await service.readSavedRoute(OWNER.sub, saved.id);
    expect(read).not.toBeNull();
    expect(read.name).toBe('Morning Loop');
    expect(read.distance).toBe(12000);
    expect(read.duration).toBe(3600);
  });

  it('returns null when reading a non-existent route', async () => {
    const result = await service.readSavedRoute(OWNER.sub, 'does-not-exist');
    expect(result).toBeNull();
  });

  it('assigns createdAt and updatedAt timestamps', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, BASE_PAYLOAD, OWNER);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
    expect(new Date(saved.createdAt).getTime()).not.toBeNaN();
  });
});

// ─── input sanitization ───────────────────────────────────────────────────────

describe('writeSavedRoute — input sanitization', () => {
  it('truncates name to 120 characters', async () => {
    const longName = 'A'.repeat(200);
    const saved = await service.writeSavedRoute(OWNER.sub, { ...BASE_PAYLOAD, name: longName }, OWNER);
    expect(saved.name.length).toBeLessThanOrEqual(120);
  });

  it('falls back to a date-based name when name is empty', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, { ...BASE_PAYLOAD, name: '' }, OWNER);
    expect(saved.name).toMatch(/^Route \d{4}-\d{2}-\d{2}/);
  });

  it('ignores invalid startPoint and endPoint coordinates', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD,
      startPoint: ['not-a-lat', 'not-a-lon'],
      endPoint: null,
    }, OWNER);
    expect(saved.startPoint).toBeNull();
    expect(saved.endPoint).toBeNull();
  });

  it('defaults visibility to "private" for unknown values', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD, visibility: 'top-secret',
    }, OWNER);
    expect(saved.visibility).toBe('private');
  });

  it('accepts "public" visibility', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD, visibility: 'public',
    }, OWNER);
    expect(saved.visibility).toBe('public');
  });

  it('deduplicates and lowercases the sharedWith list', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD,
      sharedWith: ['Alice@Test.com', 'alice@test.com', 'bob@test.com'],
    }, OWNER);
    expect(saved.sharedWith).toContain('alice@test.com');
    expect(saved.sharedWith).toContain('bob@test.com');
    // duplicates removed
    expect(saved.sharedWith.filter((v) => v === 'alice@test.com').length).toBe(1);
  });

  it('strips path separators from sub to prevent path traversal', async () => {
    const evilSub = '../../etc/passwd';
    const saved = await service.writeSavedRoute(evilSub, BASE_PAYLOAD, { sub: evilSub });
    // normalizeSub replaces '/' with '_' — no directory separators remain
    expect(saved.ownerSub).not.toContain('/');
    expect(saved.ownerSub).not.toContain('\\');
  });
});

// ─── access control ───────────────────────────────────────────────────────────

describe('readVisibleSavedRoute — access control', () => {
  let privateRoute;
  let publicRoute;
  let sharedRoute;

  beforeAll(async () => {
    privateRoute = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD, name: 'Private', visibility: 'private',
    }, OWNER);

    publicRoute = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD, name: 'Public', visibility: 'public',
    }, OWNER);

    sharedRoute = await service.writeSavedRoute(OWNER.sub, {
      ...BASE_PAYLOAD,
      name: 'Shared',
      visibility: 'private',
      sharedWith: [SHARED_USER.email],
    }, OWNER);
  });

  it('owner can read their own private route', async () => {
    const route = await service.readVisibleSavedRoute(OWNER.sub, OWNER.sub, privateRoute.id, OWNER);
    expect(route).not.toBeNull();
    expect(route.name).toBe('Private');
  });

  it('stranger cannot read a private route', async () => {
    const route = await service.readVisibleSavedRoute(STRANGER.sub, OWNER.sub, privateRoute.id, STRANGER);
    expect(route).toBeNull();
  });

  it('anyone can read a public route', async () => {
    const route = await service.readVisibleSavedRoute(STRANGER.sub, OWNER.sub, publicRoute.id, STRANGER);
    expect(route).not.toBeNull();
    expect(route.name).toBe('Public');
  });

  it('shared user can read a route shared with them by email', async () => {
    const route = await service.readVisibleSavedRoute(SHARED_USER.sub, OWNER.sub, sharedRoute.id, SHARED_USER);
    expect(route).not.toBeNull();
    expect(route.name).toBe('Shared');
  });

  it('non-shared stranger cannot read a shared-with-others route', async () => {
    const route = await service.readVisibleSavedRoute(STRANGER.sub, OWNER.sub, sharedRoute.id, STRANGER);
    expect(route).toBeNull();
  });
});

// ─── rename / delete ──────────────────────────────────────────────────────────

describe('renameSavedRoute', () => {
  it('updates the name and persists it', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, BASE_PAYLOAD, OWNER);
    const renamed = await service.renameSavedRoute(OWNER.sub, saved.id, 'Renamed Ride');
    expect(renamed.name).toBe('Renamed Ride');

    const read = await service.readSavedRoute(OWNER.sub, saved.id);
    expect(read.name).toBe('Renamed Ride');
  });
});

describe('deleteSavedRoute', () => {
  it('removes the route so subsequent reads return null', async () => {
    const saved = await service.writeSavedRoute(OWNER.sub, BASE_PAYLOAD, OWNER);
    const deleted = await service.deleteSavedRoute(OWNER.sub, saved.id);
    expect(deleted).toBe(true);

    const read = await service.readSavedRoute(OWNER.sub, saved.id);
    expect(read).toBeNull();
  });

  it('returns false when deleting a non-existent route', async () => {
    const result = await service.deleteSavedRoute(OWNER.sub, 'ghost-route-id');
    expect(result).toBe(false);
  });
});

// ─── listSavedRoutes ──────────────────────────────────────────────────────────

describe('listSavedRoutes', () => {
  it('returns all routes owned by the user', async () => {
    const uniqueSub = `list-test-${Date.now()}`;
    await service.writeSavedRoute(uniqueSub, { ...BASE_PAYLOAD, name: 'Route A' }, { sub: uniqueSub });
    await service.writeSavedRoute(uniqueSub, { ...BASE_PAYLOAD, name: 'Route B' }, { sub: uniqueSub });

    const routes = await service.listSavedRoutes(uniqueSub, { sub: uniqueSub });
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const names = routes.map((r) => r.name);
    expect(names).toContain('Route A');
    expect(names).toContain('Route B');
  });

  it('does not include geometry in list results', async () => {
    const uniqueSub = `list-geo-${Date.now()}`;
    await service.writeSavedRoute(uniqueSub, BASE_PAYLOAD, { sub: uniqueSub });
    const routes = await service.listSavedRoutes(uniqueSub, { sub: uniqueSub });
    expect(routes[0].route).toBeUndefined();
  });

  it('returns no owned routes for a user who has never saved anything', async () => {
    // listSavedRoutes includes other users' public routes too, so we only check
    // that this user owns none of the returned entries
    const routes = await service.listSavedRoutes('brand-new-user', { sub: 'brand-new-user' });
    const ownedByNewUser = routes.filter((r) => r.ownerSub === 'brand-new-user');
    expect(ownedByNewUser).toEqual([]);
  });
});
