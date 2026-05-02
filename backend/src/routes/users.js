const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { resolveUserProfiles, searchUserProfiles } = require('../services/profileService');

router.get('/search', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const users = await searchUserProfiles(req.query.q || '', user.sub || '');
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to search users', message: error.message });
  }
});

router.get('/resolve', requireAuth, async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const users = await resolveUserProfiles(ids);
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve users', message: error.message });
  }
});

module.exports = router;
