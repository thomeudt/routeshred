# RouteShred — Development Guide

## Starting the Dev Environment

```bash
# Frontend + Backend only (no BRouter, OSRM demo server used)
npm run dev

# Frontend + Backend + BRouter Docker container
npm run dev:brouter

# Full stack via Docker (BRouter + Keycloak + app)
npm run dev:brouter:docker
```

Individual workspaces:
```bash
npm run dev --workspace=frontend   # http://localhost:3000
npm run dev --workspace=backend    # http://localhost:5050
```

## File Structure

```
backend/src/
├── server.js                # Express entry point, route registration
├── routes/
│   ├── routing.js           # POST /api/routing/route, /analyze
│   ├── elevation.js         # POST /api/elevation/profile
│   ├── export.js            # POST /api/export/tcx, /gpx
│   ├── geocode.js           # GET /api/geocode/search
│   ├── auth.js              # GET /api/auth/config, /me
│   ├── profile.js           # GET/PUT /api/profile
│   ├── savedRoutes.js       # CRUD /api/routes
│   ├── groupRides.js        # CRUD /api/group-rides + join/leave/comments
│   ├── users.js             # GET /api/users/search, /resolve
│   ├── tiles.js             # GET /api/tiles/:style/:z/:x/:y.png
│   └── docs.js              # GET /api/docs/manual, screenshots
└── services/
    ├── routingService.js    # BRouter / OSRM + terrain + weather
    ├── openaiRoutePlannerService.js # Optional OpenAI-assisted loops
    ├── elevationService.js  # Open-Meteo / Open-Elevation + cache
    ├── exportService.js     # TCX + GPX template generation
    ├── geocodingService.js  # Nominatim + Overpass POI search
    ├── keycloakService.js   # Token validation, requireAuth middleware
    ├── profileService.js    # Rider profile persistence (JSON files)
    ├── savedRouteService.js # Route persistence (JSON files)
    ├── groupRideService.js  # Group ride persistence + sanitization
    └── tileService.js       # Thunderforest tile proxy + disk cache

frontend/src/
├── components/
│   ├── Header.js            # App bar: tabs, auth buttons (desktop)
│   ├── BottomNav.js         # Mobile fixed bottom navigation bar
│   ├── MapComponent.js      # Leaflet map, markers, polyline, POI layer
│   ├── RouteControls.js     # Full planning UI (personas, bike, export…)
│   ├── ElevationProfile.js  # Recharts elevation chart
│   ├── LocationInput.js     # Address/POI search + GPS shortcut
│   ├── SavedRoutesPanel.js  # Saved routes list + search/radius filters
│   ├── GroupRidesPanel.js   # Group rides feed, participants, comments
│   ├── RouteDetail.js       # Deep-link route detail page
│   └── RouteTypeStats.js    # Terrain surface breakdown chart
├── store/
│   └── routeStore.js        # Zustand store — all app state + async actions
├── styles/
│   ├── RouteControls.css    # Primary stylesheet (panels, forms, buttons)
│   ├── Header.css           # Header / tabs
│   ├── Map.css              # Map container, mobile bottom sheet
│   ├── BottomNav.css        # Mobile bottom navigation
│   ├── ElevationProfile.css # Elevation panel
│   └── RouteTypeStats.css   # Stats chart
└── i18n.js                  # DE + EN translations
```

## Adding an API Endpoint

1. Create a route handler in `backend/src/routes/`:

```javascript
// backend/src/routes/myFeature.js
const express = require('express');
const router = express.Router();
const { doTheThing } = require('../services/myFeatureService');

router.post('/', async (req, res) => {
  try {
    const result = await doTheThing(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

2. Register in `backend/src/server.js`:

```javascript
const myFeatureRouter = require('./routes/myFeature');
app.use('/api/my-feature', myFeatureRouter);
```

3. For protected endpoints use `requireAuth` from `keycloakService`:

```javascript
const { requireAuth } = require('../services/keycloakService');
router.get('/protected', requireAuth, async (req, res) => {
  // req.user.sub, req.user.preferred_username available
});
```

## Adding a React Component

1. Create the component:

```javascript
// frontend/src/components/MyPanel.js
import React from 'react';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import '../styles/MyPanel.css';

function MyPanel() {
  const { route } = useRouteStore();
  return <div className="my-panel">{/* JSX */}</div>;
}

export default MyPanel;
```

2. Add styles in `frontend/src/styles/MyPanel.css`.

3. Import and render in the appropriate parent (usually `RouteControls.js` for new panels in the plan/setup tabs).

## Using the Zustand Store

```javascript
import { useRouteStore } from '../store/routeStore';

function MyComponent() {
  // Subscribe to specific slices to avoid unnecessary re-renders
  const route = useRouteStore(state => state.route);
  const { calculateRoute, setStartPoint } = useRouteStore();

  return <button onClick={calculateRoute}>Calculate</button>;
}
```

Key store actions:
- `setStartPoint(point, label)` / `setEndPoint(point, label)`
- `insertWaypoint(point, label, index)`
- `updateWaypoint(id, point, label)` / `moveWaypoint(fromIndex, toIndex)`
- `calculateRoute()` — calls backend, updates `route`
- `planAiRoundtrip(options, token)` — authenticated AI-assisted loop planning
- `exportRoute(format)` — `'tcx'` or `'gpx'`, triggers download
- `saveRoute(name)` / `loadSavedRoute(id, ownerSub)` / `deleteSavedRoute(id)`
- `loadSavedRoutes()` — refreshes `savedRoutes` list

## Adding Translations

Add keys to both locale blocks in `frontend/src/i18n.js`:

```javascript
// German block (de)
myFeature: {
  title: 'Meine Funktion',
  action: 'Ausführen',
},

// English block (en)
myFeature: {
  title: 'My Feature',
  action: 'Execute',
},
```

Use in components: `t('myFeature.title')` or `t('myFeature.action')`.

Supports `{{variable}}` interpolation: `t('route.count', { count: 3 })`.

## Testing

```bash
# Backend (Jest)
cd backend && npm test

# Frontend (React Testing Library)
cd frontend && npm test

# Production-style build
npm run build

# Record/update the browser tutorial video
ROUTESHRED_TUTORIAL_USER=... ROUTESHRED_TUTORIAL_PASSWORD=... npm run record:tutorial

# Refresh manual screenshots
TUTORIAL_BASE=http://localhost:3000 KC_USER=... KC_PASS=... node scripts/take-screenshots.js

# Add narration and mux final MP4
TUTORIAL_TTS_PROVIDER=openai OPENAI_API_KEY=... npm run narrate:tutorial

# If the voiceover is longer than the recording, the last video frame is held automatically.
# Increase this only for very long narration overruns:
TUTORIAL_FINAL_FRAME_HOLD_SECONDS=180 npm run narrate:tutorial

# Optional: add a small buffer after the narration before ffmpeg cuts the cloned final frame.
TUTORIAL_FINAL_FRAME_HOLD_BUFFER_SECONDS=4 npm run narrate:tutorial
```

## Debugging

### Backend

```bash
node --inspect-brk backend/src/server.js
# Open Chrome → chrome://inspect
```

Or use VS Code: press F5 (launch config in `.vscode/launch.json` if present).

Check the health endpoint to confirm routing engine and config:

```bash
curl http://localhost:5050/api/health
```

### Frontend

- React DevTools browser extension
- Zustand DevTools (works with Redux DevTools extension)
- Check `Network` tab for `/api/*` requests

## Common Issues

**"Port 5050 already in use"**

```bash
lsof -i :5050
kill -9 <PID>
```

`npm run dev:brouter` handles this automatically.

**CORS errors in browser**

The frontend proxies `/api` to `http://localhost:5050` via `"proxy"` in `frontend/package.json`. This only works with `npm run dev --workspace=frontend`. If you're running the frontend build statically, configure `REACT_APP_API_URL` and ensure the backend has the correct `CORS_ORIGIN`.

**BRouter returns empty route**

1. Confirm BRouter is running: `curl http://localhost:17777/brouter/version`
2. Check that `.rd5` segments exist in `brouter-data/segments4/` for the requested region
3. Enable `BROUTER_AUTO_FETCH_SEGMENTS=true` to auto-download missing tiles

**Route geometry has no elevation (`coord[2]` is null)**

The elevation enrichment runs after routing. Check `ROUTESHRED_CACHE_DIR` is writable and that Open-Meteo is reachable. Elevation fallback is Open-Elevation.

**`/api/docs/manual` crashes with `ERR_REQUIRE_ESM`**

Use the current `docs.js` implementation, which dynamically imports `marked`. If you update `marked`, keep the route CommonJS-compatible because the backend still runs as CommonJS on Node 18.

**GPS works on desktop but not iOS Safari**

Geolocation requires `https://` or `localhost`. In production, keep `Permissions-Policy: geolocation=(self)` on the app response and allow location for Safari Websites in iOS settings.

## Code Style

ESLint is configured for both workspaces:

```bash
# Lint
npm run lint --workspace=backend
npm run lint --workspace=frontend

# Auto-fix
npm run lint --workspace=backend -- --fix
```

No Tailwind in active use — all styling is plain CSS in `frontend/src/styles/`.

---

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment.
