const express = require('express');
const router = express.Router();
const {
  getRoute,
  analyzeRoute,
  getBikeProfiles,
  createBikeProfile,
  renameBikeProfile,
  deleteBikeProfile,
  getBikeProfileContent,
  updateBikeProfileContent
} = require('../services/routingService');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/routing/profiles
 * List available bike profiles from BRouter customprofiles.
 */
router.get('/profiles', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    res.json({ profiles: await getBikeProfiles(user) });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({ error: 'Failed to load routing profiles', message: error.message });
  }
});

router.get('/profiles/:id/content', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    const profile = await getBikeProfileContent(req.params.id, user);
    return res.json({ profile });
  } catch (error) {
    console.error('Profile content load error:', error);
    return res.status(400).json({ error: 'Failed to load profile content', message: error.message });
  }
});

router.put('/profiles/:id/content', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    const content = req.body && typeof req.body.content === 'string' ? req.body.content : '';
    const profile = await updateBikeProfileContent(req.params.id, content, user);
    return res.json({ profile });
  } catch (error) {
    console.error('Profile content save error:', error);
    return res.status(400).json({ error: 'Failed to save profile content', message: error.message });
  }
});

router.patch('/profiles/:id', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    const profile = await renameBikeProfile(req.params.id, req.body && req.body.name, user);
    return res.json({ profile });
  } catch (error) {
    console.error('Profile rename error:', error);
    return res.status(400).json({ error: 'Failed to rename profile', message: error.message });
  }
});

router.delete('/profiles/:id', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    const result = await deleteBikeProfile(req.params.id, user);
    return res.json(result);
  } catch (error) {
    console.error('Profile delete error:', error);
    return res.status(400).json({ error: 'Failed to delete profile', message: error.message });
  }
});

/**
 * POST /api/routing/profiles
 * Create a custom bike profile by cloning an existing BRouter profile.
 * Body: { name: string, baseProfileId?: string }
 */
router.post('/profiles', requireAuth, async (req, res) => {
  try {
    const user = req.auth && req.auth.user ? req.auth.user : {};
    const profile = await createBikeProfile(req.body || {}, user);
    return res.status(201).json({ profile });
  } catch (error) {
    console.error('Profile creation error:', error);
    return res.status(400).json({ error: 'Failed to create profile', message: error.message });
  }
});

/**
 * POST /api/routing/route
 * Find optimal bike route between two points
 * Body: { start: [lat, lon], end: [lat, lon], waypoints: [[lat, lon], ...], bikeType: '<brouter-profile-id>', preference: 'fastest' | 'scenic' | 'offroad' }
 */
router.post('/route', requireAuth, async (req, res) => {
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
router.post('/analyze', requireAuth, async (req, res) => {
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
