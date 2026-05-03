'use strict';

describe('routingService SSRF hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ROUTING_ENGINE: 'osrm',
      OSRM_API: 'http://router.project-osrm.org',
      WIND_SPEED_ENABLED: 'false',
      OPTIONAL_ROUTE_LOOKUPS_ENABLED: 'false',
      RAILWAY_SAFETY_ENABLED: 'false',
      PREFERENCE_GUIDANCE_ENABLED: 'false',
      CYCLEWAY_AFFINITY_ENABLED: 'false'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function mockAxiosGet(impl = async () => ({ data: {} })) {
    const get = jest.fn(impl);
    jest.doMock('axios', () => ({ get }));
    return get;
  }

  it('rejects invalid coordinates in getRoute before outbound HTTP', async () => {
    const axiosGet = mockAxiosGet();
    const { getRoute } = require('../routingService');

    await expect(
      getRoute(['not-a-lat', 9.0], [48.6, 9.1], { bikeType: 'road', preference: 'scenic', rideType: 'z2' })
    ).rejects.toThrow('Routing failed: Invalid latitude coordinate');

    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects invalid coordinates in analyzeRoute before outbound HTTP', async () => {
    const axiosGet = mockAxiosGet();
    const { analyzeRoute } = require('../routingService');

    await expect(
      analyzeRoute([[48.5, 9.0], ['bad-lat', 9.1]])
    ).rejects.toThrow('Analysis failed: Invalid latitude coordinate');

    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('builds OSRM URLs against configured base host for valid input', async () => {
    const axiosGet = mockAxiosGet(async (url) => {
      if (url.includes('/route/v1/')) {
        return {
          data: {
            routes: [
              {
                geometry: { coordinates: [[9.0, 48.5], [9.1, 48.6]] },
                distance: 12000,
                duration: 3600,
                legs: [{ duration: 3600, steps: [] }]
              }
            ]
          }
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { getRoute } = require('../routingService');
    await getRoute([48.5, 9.0], [48.6, 9.1], { bikeType: 'road', preference: 'scenic', rideType: 'z2' });

    expect(axiosGet).toHaveBeenCalled();
    const firstUrl = String(axiosGet.mock.calls[0][0] || '');
    expect(firstUrl).toMatch(/^http:\/\/router\.project-osrm\.org\//);
    expect(firstUrl).toContain('/route/v1/cycling/');
  });
});
