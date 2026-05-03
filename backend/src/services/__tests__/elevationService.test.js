'use strict';

const { calculateElevationGain, calculateAvgGradient } = require('../elevationService');

// ─── calculateElevationGain ───────────────────────────────────────────────────

describe('calculateElevationGain', () => {
  it('sums positive deltas (direction "up")', () => {
    // 100→150 (+50), 150→120 (skip), 120→200 (+80) = 130
    expect(calculateElevationGain([100, 150, 120, 200], 'up')).toBe(130);
  });

  it('sums negative deltas in absolute terms (direction "down")', () => {
    // 100→150 (skip), 150→120 (−30), 120→200 (skip) = 30
    expect(calculateElevationGain([100, 150, 120, 200], 'down')).toBe(30);
  });

  it('defaults to "up" when no direction given', () => {
    expect(calculateElevationGain([100, 200, 150])).toBe(100);
  });

  it('returns 0 for a completely flat route', () => {
    expect(calculateElevationGain([100, 100, 100], 'up')).toBe(0);
    expect(calculateElevationGain([100, 100, 100], 'down')).toBe(0);
  });

  it('returns 0 for a single elevation value', () => {
    expect(calculateElevationGain([500])).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(calculateElevationGain([])).toBe(0);
  });

  it('returns an integer (rounds the total)', () => {
    const gain = calculateElevationGain([100, 100.6, 101.3]);
    expect(Number.isInteger(gain)).toBe(true);
  });

  it('handles negative starting elevation', () => {
    // −50 → 0 (+50), 0 → 100 (+100) = 150
    expect(calculateElevationGain([-50, 0, 100], 'up')).toBe(150);
  });

  it('counts only descents for "down" on a monotonically descending route', () => {
    expect(calculateElevationGain([500, 400, 300, 200], 'down')).toBe(300);
    expect(calculateElevationGain([500, 400, 300, 200], 'up')).toBe(0);
  });
});

// ─── calculateAvgGradient ─────────────────────────────────────────────────────

describe('calculateAvgGradient', () => {
  it('returns "0.00" string for a flat route', () => {
    const coords = [[48.5, 9.0], [48.5001, 9.0]];
    expect(calculateAvgGradient(coords, [100, 100])).toBe('0.00');
  });

  it('returns a numeric string with two decimal places', () => {
    const coords = [[48.0, 9.0], [48.1, 9.0]]; // ~11.1 km
    const elevations = [100, 1210]; // ~10% gradient
    const result = calculateAvgGradient(coords, elevations);
    expect(result).toMatch(/^\d+\.\d{2}$/);
  });

  it('returns a positive value for a route with net elevation gain', () => {
    const coords = [[48.0, 9.0], [48.1, 9.0]];
    const elevations = [100, 600];
    const gradient = parseFloat(calculateAvgGradient(coords, elevations));
    expect(gradient).toBeGreaterThan(0);
  });

  it('returns "0.00" for a pure descent (no uphill segments)', () => {
    const coords = [[48.0, 9.0], [48.05, 9.0], [48.1, 9.0]];
    const elevations = [500, 300, 100];
    expect(calculateAvgGradient(coords, elevations)).toBe('0.00');
  });

  it('returns 0 when only a single coordinate is provided', () => {
    expect(calculateAvgGradient([[48.0, 9.0]], [100])).toBe(0);
  });

  it('gradient is proportional to elevation change for a straight segment', () => {
    // two points ~1 km apart (roughly 0.009 degrees lat ≈ 1 km)
    const coords = [[48.0, 9.0], [48.009, 9.0]];
    const low = parseFloat(calculateAvgGradient(coords, [100, 110]));  // +10m
    const high = parseFloat(calculateAvgGradient(coords, [100, 200])); // +100m
    expect(high).toBeGreaterThan(low);
  });
});
