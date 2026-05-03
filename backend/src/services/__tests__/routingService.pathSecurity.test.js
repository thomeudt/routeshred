'use strict';

describe('routingService path traversal hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ROUTING_ENGINE: 'osrm',
      OSRM_API: 'http://router.project-osrm.org'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects path-like baseProfileId before any file read', async () => {
    const readFile = jest.fn();
    const readdir = jest.fn(async () => []);

    jest.doMock('fs/promises', () => ({
      readdir,
      readFile,
      writeFile: jest.fn(),
      access: jest.fn(),
      unlink: jest.fn(),
      mkdir: jest.fn()
    }));

    jest.doMock('axios', () => ({ get: jest.fn() }));

    const { createBikeProfile } = require('../routingService');

    await expect(
      createBikeProfile({ name: 'Safe Name', baseProfileId: '../secrets' }, { sub: 'user-1' })
    ).rejects.toThrow('Invalid base profile id');

    expect(readFile).not.toHaveBeenCalled();
  });
});
