const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listSavedRoutes,
  readVisibleSavedRoute,
  writeSavedRoute,
  deleteSavedRoute,
  renameSavedRoute,
  updateSavedRouteSharing
} = require('../services/savedRouteService');

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
    const user = req.auth.user || {};
    const sub = getSubject(req, res);
    if (!sub) return null;

    return res.json({ routes: await listSavedRoutes(sub, user) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load saved routes', message: error.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const sub = getSubject(req, res);
    if (!sub) return null;

    const route = await readVisibleSavedRoute(sub, req.query.owner || sub, req.params.id, user);
    if (!route) {
      return res.status(404).json({ error: 'Not found', message: 'Saved route not found' });
    }

    return res.json({ route });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load saved route', message: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const sub = getSubject(req, res);
    if (!sub) return null;

    const route = await writeSavedRoute(sub, req.body || {}, user);
    return res.status(201).json({ route });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save route', message: error.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.auth.user || {};
    const sub = getSubject(req, res);
    if (!sub) return null;

    const route = await writeSavedRoute(sub, { ...(req.body || {}), id: req.params.id }, user);
    return res.json({ route });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save route', message: error.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const payload = req.body || {};
    const route = payload.name !== undefined
      ? await renameSavedRoute(sub, req.params.id, payload.name)
      : await updateSavedRouteSharing(sub, req.params.id, payload);
    if (!route) {
      return res.status(404).json({ error: 'Not found', message: 'Saved route not found' });
    }

    return res.json({ route });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to rename saved route', message: error.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sub = getSubject(req, res);
    if (!sub) return null;

    const deleted = await deleteSavedRoute(sub, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Not found', message: 'Saved route not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete saved route', message: error.message });
  }
});

module.exports = router;
