const express = require('express');
const router = express.Router();
const { searchPlaces, searchPlacesQuick } = require('../services/geocodingService');

router.get('/search/quick', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 200) {
    return res.json({ places: [] });
  }
  try {
    const places = await searchPlacesQuick(q, {
      limit: req.query.limit,
      language: req.query.lang || req.headers['accept-language']
    });
    res.json({ places });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search places', message: error.message });
  }
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 200) {
    return res.json({ places: [] });
  }
  try {
    const places = await searchPlaces(q, {
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
