const express = require('express');
const router = express.Router();
const { fetchTile, isValidTile } = require('../services/tileService');

// GET /api/tiles/:style/:z/:x/:y.png
router.get('/:style/:z/:x/:y.png', async (req, res) => {
  const { style, z, x, y } = req.params;
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);

  if (!isValidTile(style, zi, xi, yi)) {
    return res.status(400).end();
  }

  try {
    const { data, fromCache } = await fetchTile(style, zi, xi, yi);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=7776000'); // 90 days in browser cache too
    if (fromCache) res.set('X-Cache', 'HIT');
    res.send(data);
  } catch (err) {
    if (err.message.includes('not configured')) {
      return res.status(503).end();
    }
    console.error(`Tile proxy error ${style}/${z}/${x}/${y}:`, err.message);
    res.status(502).end();
  }
});

module.exports = router;
