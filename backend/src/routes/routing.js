const express = require('express');
const router = express.Router();
const { getRoute, analyzeRoute, getBikeProfiles } = require('../services/routingService');

/**
 * GET /api/routing/profiles
 * List available bike profiles from BRouter customprofiles.
 */
router.get('/profiles', async (req, res) => {
  try {
    res.json({ profiles: await getBikeProfiles() });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({ error: 'Failed to load routing profiles', message: error.message });
  }
});

/**
 * POST /api/routing/route
 * Find optimal bike route between two points
 * Body: { start: [lat, lon], end: [lat, lon], waypoints: [[lat, lon], ...], bikeType: '<brouter-profile-id>', preference: 'fastest' | 'scenic' | 'offroad' }
 */
router.post('/route', async (req, res) => {
  try {
    const {
      start, end,
      waypoints = [],
      bikeType = 'road',
      preference = 'scenic',
      rideType = 'z2',
      riderProfile = {}
    } = req.body;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end coordinates required' });
    }

    const route = await getRoute(start, end, { waypoints, bikeType, preference, rideType, riderProfile });
    res.json(route);
  } catch (error) {
    console.error('Routing error:', error);
    res.status(500).json({ error: 'Failed to calculate route', message: error.message });
  }
});

/**
 * POST /api/routing/analyze
 * Analyze route for terrain, elevation, surface type
 */
router.post('/analyze', async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates) {
      return res.status(400).json({ error: 'Coordinates required' });
    }

    const analysis = await analyzeRoute(coordinates);
    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze route', message: error.message });
  }
});

module.exports = router;
