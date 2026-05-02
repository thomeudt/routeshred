const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const {
  listVisibleRides,
  readVisibleRide,
  createOrUpdateRide,
  deleteRide,
  joinRide,
  leaveRide,
  addRideComment
} = require('../services/groupRideService');

function getOwnerSub(req) {
  return req.body?.ownerSub || req.query?.owner || '';
}

function getSubject(req, res) {
  const user = req.auth && req.auth.user ? req.auth.user : {};
  if (!user.sub) {
    res.status(400).json({ error: 'Invalid token', message: 'Token has no subject claim' });
    return null;
  }
  return user.sub;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    return res.json({ rides: await listVisibleRides(sub) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load group rides', message: error.message });
  }
});

router.get('/public/:owner/:id', optionalAuth, async (req, res) => {
  try {
    const currentSub = req.auth && req.auth.user && req.auth.user.sub ? req.auth.user.sub : '';
    const ride = await readVisibleRide(currentSub, req.params.owner, req.params.id);
    if (!ride || ride.access === 'private') {
      return res.status(404).json({ error: 'Not found', message: 'Group ride not found' });
    }

    return res.json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load group ride', message: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const ride = await createOrUpdateRide(sub, req.body || {}, req.auth.user || {});
    return res.status(201).json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create group ride', message: error.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const ride = await createOrUpdateRide(sub, { ...(req.body || {}), id: req.params.id }, req.auth.user || {});
    return res.json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update group ride', message: error.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const deleted = await deleteRide(sub, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Not found', message: 'Group ride not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete group ride', message: error.message });
  }
});

router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const ride = await joinRide(sub, getOwnerSub(req), req.params.id, req.auth.user || {});
    if (!ride) {
      return res.status(404).json({ error: 'Not found', message: 'Group ride not found' });
    }

    return res.json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to join group ride', message: error.message });
  }
});

router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const ride = await leaveRide(sub, getOwnerSub(req), req.params.id);
    if (!ride) {
      return res.status(404).json({ error: 'Not found', message: 'Group ride not found' });
    }

    return res.json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to leave group ride', message: error.message });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Bad request', message: 'Comment text is required' });
    }

    const ride = await addRideComment(sub, getOwnerSub(req), req.params.id, text, req.auth.user || {});
    if (!ride) {
      return res.status(404).json({ error: 'Not found', message: 'Group ride not found' });
    }

    return res.json({ ride });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add comment', message: error.message });
  }
});

module.exports = router;
