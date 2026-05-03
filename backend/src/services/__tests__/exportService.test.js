'use strict';

const { generateTCXFile, generateGPXFile } = require('../exportService');

const MINIMAL_ROUTE = {
  geometry: { coordinates: [[9.0, 48.5, 400], [9.1, 48.6, 450]] },
  distance: 12000,
  duration: 3600,
};

// ─── generateTCXFile ─────────────────────────────────────────────────────────

describe('generateTCXFile', () => {
  it('produces valid TCX envelope with expected elements', async () => {
    const xml = await generateTCXFile(MINIMAL_ROUTE, { name: 'MorningRide' });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<TrainingCenterDatabase');
    expect(xml).toContain('<Name>MorningRide</Name>');
    expect(xml).toContain('<Trackpoint>');
  });

  it('places latitude in LatitudeDegrees and longitude in LongitudeDegrees', async () => {
    const xml = await generateTCXFile(MINIMAL_ROUTE);
    // coord = [lon=9.0, lat=48.5] → lat=48.5, lon=9
    expect(xml).toContain('<LatitudeDegrees>48.5</LatitudeDegrees>');
    expect(xml).toContain('<LongitudeDegrees>9</LongitudeDegrees>');
  });

  it('escapes XML special characters in name', async () => {
    const xml = await generateTCXFile(MINIMAL_ROUTE, { name: 'A&B <Evil> "test"' });
    expect(xml).toContain('A&amp;B &lt;Evil&gt; &quot;test&quot;');
    expect(xml).not.toContain('<Evil>');
  });

  it('replaces non-finite coordinate values with 0', async () => {
    const route = {
      geometry: { coordinates: [['not-a-number', 48.5, 400], [9.1, 'bad', 450]] },
      distance: 0,
      duration: 0,
    };
    const xml = await generateTCXFile(route);
    // lon of first coord is invalid → 0
    expect(xml).toContain('<LongitudeDegrees>0</LongitudeDegrees>');
  });

  it('falls back to 0.0 when elevation is missing', async () => {
    const route = {
      geometry: { coordinates: [[9.0, 48.5], [9.1, 48.6]] },
      distance: 1000,
      duration: 300,
    };
    const xml = await generateTCXFile(route);
    expect(xml).toContain('<AltitudeMeters>0.0</AltitudeMeters>');
  });

  it('uses "Route" as default name', async () => {
    const xml = await generateTCXFile(MINIMAL_ROUTE);
    expect(xml).toContain('<Name>Route</Name>');
  });

  it('throws when route has fewer than 2 coordinates', async () => {
    await expect(generateTCXFile({ geometry: { coordinates: [[9, 48]] } }))
      .rejects.toThrow('Route has no coordinates');
  });

  it('throws for a route with no geometry', async () => {
    await expect(generateTCXFile({})).rejects.toThrow('Route has no coordinates');
  });

  it('throws for null input', async () => {
    await expect(generateTCXFile(null)).rejects.toThrow('Route has no coordinates');
  });

  it('downsamples routes >500 points to exactly 500 trackpoints', async () => {
    const coords = Array.from({ length: 800 }, (_, i) => [9 + i * 0.001, 48 + i * 0.001, 300]);
    const route = { geometry: { coordinates: coords }, distance: 50000, duration: 7200 };
    const xml = await generateTCXFile(route);
    const count = (xml.match(/<Trackpoint>/g) || []).length;
    expect(count).toBe(500);
  });

  it('preserves first and last coordinate after downsampling', async () => {
    const coords = Array.from({ length: 800 }, (_, i) => [9 + i * 0.001, 48 + i * 0.001, 300]);
    const route = { geometry: { coordinates: coords }, distance: 50000, duration: 7200 };
    const xml = await generateTCXFile(route);
    // first: lon=9, lat=48 | last: lon=9.799, lat=48.799
    expect(xml).toContain('<LatitudeDegrees>48</LatitudeDegrees>');
    expect(xml).toContain('48.799');
  });

  it('does not downsample routes with ≤500 points', async () => {
    const coords = Array.from({ length: 10 }, (_, i) => [9 + i * 0.01, 48 + i * 0.01, 300]);
    const route = { geometry: { coordinates: coords }, distance: 5000, duration: 1200 };
    const xml = await generateTCXFile(route);
    const count = (xml.match(/<Trackpoint>/g) || []).length;
    expect(count).toBe(10);
  });
});

// ─── generateGPXFile ─────────────────────────────────────────────────────────

describe('generateGPXFile', () => {
  it('produces valid GPX envelope with expected elements', async () => {
    const xml = await generateGPXFile(MINIMAL_ROUTE, { name: 'EveningLoop', description: 'A nice ride' });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<gpx version="1.1"');
    expect(xml).toContain('<name>EveningLoop</name>');
    expect(xml).toContain('<desc>A nice ride</desc>');
    expect(xml).toContain('<trkpt');
  });

  it('places lat and lon as attributes in correct order', async () => {
    const xml = await generateGPXFile(MINIMAL_ROUTE);
    // coord = [lon=9.0, lat=48.5]
    expect(xml).toContain('lat="48.5" lon="9"');
  });

  it('escapes XML special characters in name and description', async () => {
    const xml = await generateGPXFile(MINIMAL_ROUTE, {
      name: 'Test & "Route"',
      description: '<Inject>',
    });
    expect(xml).toContain('Test &amp; &quot;Route&quot;');
    expect(xml).toContain('&lt;Inject&gt;');
    expect(xml).not.toContain('<Inject>');
  });

  it('throws when route has fewer than 2 coordinates', async () => {
    await expect(generateGPXFile({ geometry: { coordinates: [[9, 48]] } }))
      .rejects.toThrow('Route has no coordinates');
  });

  it('downsamples routes >1000 points to exactly 1000 trackpoints', async () => {
    const coords = Array.from({ length: 1500 }, (_, i) => [9 + i * 0.001, 48 + i * 0.001, 300]);
    const route = { geometry: { coordinates: coords }, distance: 80000, duration: 12000 };
    const xml = await generateGPXFile(route);
    const count = (xml.match(/<trkpt /g) || []).length;
    expect(count).toBe(1000);
  });

  it('falls back to 0.0 elevation when coord has no third element', async () => {
    const route = {
      geometry: { coordinates: [[9.0, 48.5], [9.1, 48.6]] },
      distance: 1000,
      duration: 300,
    };
    const xml = await generateGPXFile(route);
    expect(xml).toContain('<ele>0.0</ele>');
  });
});
