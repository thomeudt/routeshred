'use strict';

const express = require('express');
const request = require('supertest');

// ─── mocks (declared before require so jest.mock hoisting works) ──────────────

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.auth = { user: { sub: 'test-user', email: 'test@example.com' } };
    next();
  },
  optionalAuth: (_req, _res, next) => next(),
}));

jest.mock('../../services/routingService', () => ({
  getRoute: jest.fn(),
  analyzeRoute: jest.fn(),
  getBikeProfiles: jest.fn(),
  createBikeProfile: jest.fn(),
  renameBikeProfile: jest.fn(),
  deleteBikeProfile: jest.fn(),
  getBikeProfileContent: jest.fn(),
  updateBikeProfileContent: jest.fn(),
}));

jest.mock('../../services/openaiRoutePlannerService', () => ({
  planRoundtrip: jest.fn(),
}));

const routingService = require('../../services/routingService');
const { planRoundtrip } = require('../../services/openaiRoutePlannerService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', require('../routing'));
  return app;
}

const MOCK_ROUTE = {
  geometry: { coordinates: [[9.0, 48.5], [9.1, 48.6]] },
  distance: 12000,
  duration: 3600,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /route ──────────────────────────────────────────────────────────────

describe('POST /route', () => {
  const app = buildApp();

  it('returns 400 when start is missing', async () => {
    const res = await request(app)
      .post('/route')
      .send({ end: [48.6, 9.1] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start.*end|coordinates/i);
  });

  it('returns 400 when end is missing', async () => {
    const res = await request(app)
      .post('/route')
      .send({ start: [48.5, 9.0] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when both start and end are missing', async () => {
    const res = await request(app).post('/route').send({});
    expect(res.status).toBe(400);
  });

  it('calls getRoute with correct parameters and returns result', async () => {
    routingService.getRoute.mockResolvedValueOnce(MOCK_ROUTE);

    const res = await request(app).post('/route').send({
      start: [48.5, 9.0],
      end: [48.6, 9.1],
      bikeType: 'road',
      preference: 'scenic',
      rideType: 'z2',
    });

    expect(res.status).toBe(200);
    expect(routingService.getRoute).toHaveBeenCalledWith(
      [48.5, 9.0],
      [48.6, 9.1],
      expect.objectContaining({ bikeType: 'road', preference: 'scenic', rideType: 'z2' })
    );
    expect(res.body.distance).toBe(12000);
  });

  it('returns 500 when getRoute throws', async () => {
    routingService.getRoute.mockRejectedValueOnce(new Error('BRouter unreachable'));
    const res = await request(app).post('/route').send({
      start: [48.5, 9.0],
      end: [48.6, 9.1],
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/route/i);
  });

  it('uses default values for optional parameters', async () => {
    routingService.getRoute.mockResolvedValueOnce(MOCK_ROUTE);
    await request(app).post('/route').send({ start: [48.5, 9.0], end: [48.6, 9.1] });
    expect(routingService.getRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bikeType: 'road', preference: 'scenic', rideType: 'z2', waypoints: [] })
    );
  });
});

// ─── POST /analyze ────────────────────────────────────────────────────────────

describe('POST /analyze', () => {
  const app = buildApp();

  it('returns 400 when coordinates are missing', async () => {
    const res = await request(app).post('/analyze').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/coordinates/i);
  });

  it('calls analyzeRoute and returns result', async () => {
    const mockAnalysis = { surfaceBreakdown: { asphalt: 80, gravel: 20 } };
    routingService.analyzeRoute.mockResolvedValueOnce(mockAnalysis);

    const coords = [[48.5, 9.0], [48.6, 9.1]];
    const res = await request(app).post('/analyze').send({ coordinates: coords });

    expect(res.status).toBe(200);
    expect(routingService.analyzeRoute).toHaveBeenCalledWith(coords);
    expect(res.body.surfaceBreakdown.asphalt).toBe(80);
  });

  it('returns 500 when analyzeRoute throws', async () => {
    routingService.analyzeRoute.mockRejectedValueOnce(new Error('Overpass timeout'));
    const res = await request(app).post('/analyze').send({ coordinates: [[48.5, 9.0], [48.6, 9.1]] });
    expect(res.status).toBe(500);
  });
});

// ─── GET /profiles ────────────────────────────────────────────────────────────

describe('GET /profiles', () => {
  const app = buildApp();

  it('returns available bike profiles', async () => {
    const mockProfiles = [
      { id: 'road', name: 'Road', owner: 'system' },
      { id: 'gravel', name: 'Gravel', owner: 'system' },
    ];
    routingService.getBikeProfiles.mockResolvedValueOnce(mockProfiles);

    const res = await request(app).get('/profiles');
    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(2);
    expect(res.body.profiles[0].id).toBe('road');
  });

  it('returns 500 when getBikeProfiles throws', async () => {
    routingService.getBikeProfiles.mockRejectedValueOnce(new Error('disk error'));
    const res = await request(app).get('/profiles');
    expect(res.status).toBe(500);
  });
});

// ─── POST /profiles ───────────────────────────────────────────────────────────

describe('POST /profiles', () => {
  const app = buildApp();

  it('returns 201 with the created profile', async () => {
    const mockProfile = { id: 'my-custom', name: 'My Custom', owner: 'test-user' };
    routingService.createBikeProfile.mockResolvedValueOnce(mockProfile);

    const res = await request(app)
      .post('/profiles')
      .send({ name: 'My Custom', baseProfileId: 'road' });

    expect(res.status).toBe(201);
    expect(res.body.profile.id).toBe('my-custom');
  });

  it('returns 400 when createBikeProfile throws a validation error', async () => {
    routingService.createBikeProfile.mockRejectedValueOnce(new Error('Name already taken'));
    const res = await request(app).post('/profiles').send({ name: 'road' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /roundtrip ──────────────────────────────────────────────────────────

describe('POST /roundtrip', () => {
  const app = buildApp();

  it('returns the AI-planned route', async () => {
    planRoundtrip.mockResolvedValueOnce({ route: MOCK_ROUTE, strategy: 'ai' });
    const res = await request(app).post('/roundtrip').send({
      start: [48.5, 9.0],
      target: 'Schönbuch',
      timeBudgetMinutes: 90,
    });
    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe('ai');
  });

  it('forwards the error status code from planRoundtrip', async () => {
    const err = new Error('AI unavailable');
    err.status = 503;
    planRoundtrip.mockRejectedValueOnce(err);
    const res = await request(app).post('/roundtrip').send({ start: [48.5, 9.0] });
    expect(res.status).toBe(503);
  });

  it('defaults to 500 when error has no status', async () => {
    planRoundtrip.mockRejectedValueOnce(new Error('unexpected'));
    const res = await request(app).post('/roundtrip').send({});
    expect(res.status).toBe(500);
  });
});

// ─── auth middleware (real implementation via requireActual) ──────────────────

describe('requireAuth — real behaviour', () => {
  // jest.requireActual bypasses the top-level jest.mock so we get the real module.
  // getKeycloakConfig() reads process.env at call time, so setting env vars here works.

  it('returns 503 when KEYCLOAK_ENABLED is false', async () => {
    process.env.KEYCLOAK_ENABLED = 'false';
    const { requireAuth } = jest.requireActual('../../middleware/auth');
    const app2 = express();
    app2.use(express.json());
    app2.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }));

    const res = await request(app2).get('/protected');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/auth/i);

    delete process.env.KEYCLOAK_ENABLED;
  });

  it('returns 401 when Keycloak is enabled but no Bearer token is provided', async () => {
    process.env.KEYCLOAK_ENABLED = 'true';
    process.env.KEYCLOAK_URL = 'http://localhost:8080';
    process.env.KEYCLOAK_REALM = 'routeshred';
    process.env.KEYCLOAK_CLIENT_ID = 'routeshred-frontend';
    const { requireAuth } = jest.requireActual('../../middleware/auth');
    const app3 = express();
    app3.use(express.json());
    app3.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }));

    const res = await request(app3).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');

    delete process.env.KEYCLOAK_ENABLED;
    delete process.env.KEYCLOAK_URL;
    delete process.env.KEYCLOAK_REALM;
    delete process.env.KEYCLOAK_CLIENT_ID;
  });
});
