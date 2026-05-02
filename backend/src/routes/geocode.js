const express = require('express');
const router = express.Router();
const { searchPlaces } = require('../services/geocodingService');

router.get('/search', async (req, res) => {
  try {
    const places = await searchPlaces(req.query.q, {
      limit: req.query.limit,
      language: req.query.lang || req.headers['accept-language']
    });
    res.json({ places });
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({ error: 'Failed to search places', message: error.message });
  }
});

module.exports = router;
