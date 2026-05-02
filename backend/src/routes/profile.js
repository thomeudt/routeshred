const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { readUserProfile, writeUserProfile } = require('../services/profileService');

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const sub = user.sub;
    if (!sub) {
      return res.status(400).json({ error: 'Invalid token', message: 'Token has no subject claim' });
    }

    const profile = await readUserProfile(sub, user);
    return res.json({ profile });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load profile', message: error.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const sub = user.sub;
    if (!sub) {
      return res.status(400).json({ error: 'Invalid token', message: 'Token has no subject claim' });
    }

    const profile = await writeUserProfile(sub, req.body || {}, user);
    return res.json({ profile });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save profile', message: error.message });
  }
});

module.exports = router;
