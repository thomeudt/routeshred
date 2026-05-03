const express = require('express');
const router = express.Router();
const { generateTCXFile, generateGPXFile } = require('../services/exportService');

/**
 * POST /api/export/tcx
 * Export route as TCX file (for Wahoo, Garmin, etc)
 */
router.post('/tcx', async (req, res) => {
  try {
    const { route, name = 'Route', description = '' } = req.body;

    if (!route) {
      return res.status(400).json({ error: 'Route data required' });
    }

    const safeName = String(name || 'Route').replace(/[^\w\s.-]/g, '_').slice(0, 100);
    const tcxData = await generateTCXFile(route, { name: safeName, description });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.tcx"`);
    res.send(tcxData);
  } catch (error) {
    console.error('TCX export error:', error);
    res.status(500).json({ error: 'Failed to generate TCX file', message: error.message });
  }
});

/**
 * POST /api/export/gpx
 * Export route as GPX file (universal format)
 */
router.post('/gpx', async (req, res) => {
  try {
    const { route, name = 'Route', description = '' } = req.body;

    if (!route) {
      return res.status(400).json({ error: 'Route data required' });
    }

    const safeName = String(name || 'Route').replace(/[^\w\s.-]/g, '_').slice(0, 100);
    const gpxData = await generateGPXFile(route, { name: safeName, description });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.gpx"`);
    res.send(gpxData);
  } catch (error) {
    console.error('GPX export error:', error);
    res.status(500).json({ error: 'Failed to generate GPX file', message: error.message });
  }
});

module.exports = router;
