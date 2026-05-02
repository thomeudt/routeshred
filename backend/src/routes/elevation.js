const express = require('express');
const router = express.Router();
const { getElevationProfile } = require('../services/elevationService');

/**
 * POST /api/elevation/profile
 * Get elevation data for route coordinates
 * Body: { coordinates: [[lat, lon], ...] }
 */
router.post('/profile', async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ error: 'Coordinates array required' });
    }

    const profile = await getElevationProfile(coordinates);
    res.json(profile);
  } catch (error) {
    console.error('Elevation error:', error);
    res.status(500).json({ error: 'Failed to fetch elevation data', message: error.message });
  }
});

module.exports = router;
