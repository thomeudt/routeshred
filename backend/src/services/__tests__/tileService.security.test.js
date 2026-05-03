'use strict';

describe('tileService SSRF hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      THUNDERFOREST_API_KEY: 'test-key'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setupMocks() {
    const axiosGet = jest.fn(async () => ({ data: Buffer.from('png-bytes') }));
    const fsPromises = {
      stat: jest.fn(async () => {
        const err = new Error('not found');
        err.code = 'ENOENT';
        throw err;
      }),
      readFile: jest.fn(),
      mkdir: jest.fn(async () => {}),
      writeFile: jest.fn(async () => {})
    };

    jest.doMock('axios', () => ({ get: axiosGet }));
    jest.doMock('fs/promises', () => fsPromises);
    return { axiosGet, fsPromises };
  }

  it('rejects invalid style/path-like input before outbound HTTP', async () => {
    const { axiosGet } = setupMocks();
    const { fetchTile } = require('../tileService');

    await expect(fetchTile('../admin', 12, 2200, 1400))
      .rejects.toThrow('Invalid tile coordinates or style');

    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects out-of-range tile coordinates before outbound HTTP', async () => {
    const { axiosGet } = setupMocks();
    const { fetchTile } = require('../tileService');

    await expect(fetchTile('cycle', 5, -1, 0))
      .rejects.toThrow('Invalid tile coordinates or style');

    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects non-integer tile coordinates before outbound HTTP', async () => {
    const { axiosGet } = setupMocks();
    const { fetchTile } = require('../tileService');

    await expect(fetchTile('cycle', '5.5', 10, 12))
      .rejects.toThrow('Invalid tile coordinates or style');

    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('uses Thunderforest host for valid tile requests', async () => {
    const { axiosGet } = setupMocks();
    const { fetchTile } = require('../tileService');

    await fetchTile('cycle', 5, 10, 12);

    const requestedUrl = String(axiosGet.mock.calls[0][0] || '');
    expect(requestedUrl).toMatch(/^https:\/\/tile\.thunderforest\.com\//);
    expect(requestedUrl).toContain('/cycle/5/10/12.png');
    expect(requestedUrl).toContain('apikey=test-key');
  });
});
