'use strict';

const express = require('express');
const request = require('supertest');

// Build a minimal app — no rate limiting, no helmet, just the router under test
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', require('../export'));
  return app;
}

const MINIMAL_ROUTE = {
  geometry: { coordinates: [[9.0, 48.5, 400], [9.1, 48.6, 450]] },
  distance: 12000,
  duration: 3600,
};

// ─── TCX export ──────────────────────────────────────────────────────────────

describe('POST /tcx', () => {
  const app = buildApp();

  it('returns 400 when route is missing', async () => {
    const res = await request(app).post('/tcx').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/route/i);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/tcx').send(null);
    expect(res.status).toBe(400);
  });

  it('returns 200 with XML content-type for a valid route', async () => {
    const res = await request(app).post('/tcx').send({ route: MINIMAL_ROUTE });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
  });

  it('sets content-disposition with .tcx extension', async () => {
    const res = await request(app).post('/tcx').send({ route: MINIMAL_ROUTE, name: 'MyRide' });
    expect(res.headers['content-disposition']).toBe('attachment; filename="MyRide.tcx"');
  });

  it('sanitizes special characters from filename', async () => {
    const res = await request(app)
      .post('/tcx')
      .send({ route: MINIMAL_ROUTE, name: 'My/Evil<Route>&Name' });
    const disposition = res.headers['content-disposition'];
    expect(disposition).not.toMatch(/[<>&\/]/);
    expect(disposition).toContain('.tcx');
  });

  it('strips control characters and quotes from filename (blocks header injection)', async () => {
    const res = await request(app)
      .post('/tcx')
      .send({ route: MINIMAL_ROUTE, name: 'evil"\r\nX-Injected: true' });
    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'];
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    expect(disposition).not.toContain('"evil"'); // quote stripped, not passed through
    expect(res.headers['x-injected']).toBeUndefined();
  });

  it('caps filename at 100 characters', async () => {
    const longName = 'A'.repeat(200);
    const res = await request(app).post('/tcx').send({ route: MINIMAL_ROUTE, name: longName });
    const disposition = res.headers['content-disposition'];
    // extract the filename between quotes
    const match = disposition.match(/filename="([^"]+)"/);
    expect(match).not.toBeNull();
    const filename = match[1].replace('.tcx', '');
    expect(filename.length).toBeLessThanOrEqual(100);
  });

  it('falls back to "Route" filename when name is empty', async () => {
    const res = await request(app).post('/tcx').send({ route: MINIMAL_ROUTE, name: '' });
    expect(res.headers['content-disposition']).toContain('Route.tcx');
  });

  it('returns XML containing the route name', async () => {
    const res = await request(app).post('/tcx').send({ route: MINIMAL_ROUTE, name: 'AlpenLoop' });
    expect(res.text).toContain('<Name>AlpenLoop</Name>');
  });

  it('returns 500 when route has fewer than 2 coordinates', async () => {
    const badRoute = { geometry: { coordinates: [[9.0, 48.5]] } };
    const res = await request(app).post('/tcx').send({ route: badRoute });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/tcx/i);
  });
});

// ─── GPX export ──────────────────────────────────────────────────────────────

describe('POST /gpx', () => {
  const app = buildApp();

  it('returns 400 when route is missing', async () => {
    const res = await request(app).post('/gpx').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/route/i);
  });

  it('returns 200 with XML content-type for a valid route', async () => {
    const res = await request(app).post('/gpx').send({ route: MINIMAL_ROUTE });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
  });

  it('sets content-disposition with .gpx extension', async () => {
    const res = await request(app).post('/gpx').send({ route: MINIMAL_ROUTE, name: 'EveningLoop' });
    expect(res.headers['content-disposition']).toBe('attachment; filename="EveningLoop.gpx"');
  });

  it('sanitizes special characters from filename', async () => {
    const res = await request(app)
      .post('/gpx')
      .send({ route: MINIMAL_ROUTE, name: '<script>alert(1)</script>' });
    const disposition = res.headers['content-disposition'];
    expect(disposition).not.toContain('<');
    expect(disposition).not.toContain('>');
  });

  it('returns XML containing a gpx root element', async () => {
    const res = await request(app).post('/gpx').send({ route: MINIMAL_ROUTE });
    expect(res.text).toContain('<gpx version="1.1"');
  });

  it('returns 500 when route has fewer than 2 coordinates', async () => {
    const badRoute = { geometry: { coordinates: [[9.0, 48.5]] } };
    const res = await request(app).post('/gpx').send({ route: badRoute });
    expect(res.status).toBe(500);
  });
});
