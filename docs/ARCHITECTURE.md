# RouteShred — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (:3000)                       │
│  Header (tabs + auth)      MapComponent (Leaflet)               │
│  RouteControls (plan tab)  ElevationProfile (Recharts)          │
│  SavedRoutesPanel          GroupRidesPanel                       │
│  Zustand Store (routeStore.js)    i18n (DE/EN)                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP/REST  (proxy → :5050)
┌──────────────────────────────┴──────────────────────────────────┐
│                  Node.js / Express Backend (:5050)               │
│  /api/routing      /api/elevation   /api/export                  │
│  /api/geocode      /api/auth        /api/profile                 │
│  /api/routes       /api/group-rides /api/users  /api/tiles       │
└──┬──────────┬───────────┬──────────────┬────────────────────────┘
   │          │           │              │
┌──▼───┐  ┌──▼──────┐ ┌──▼──────┐  ┌──▼─────────────────────────┐
│BRouter│  │ OSRM    │ │Open-    │  │ Keycloak (:8080)            │
│:17777 │  │(remote) │ │Meteo /  │  │ + PostgreSQL 16             │
│       │  │         │ │Open-Ele │  │ (optional, auth)            │
└──────┘  └─────────┘ └─────────┘  └────────────────────────────┘
   │
   └── OpenAI Responses API (optional AI Roundtrip planning)
```

In production (Proxmox stack) internal Caddy sits in front and routes `/`, `/api/*`, and `/auth*` to the respective containers. It is commonly exposed on host port `8080` behind an outer HTTPS proxy such as Nginx Proxy Manager.

---

## Frontend

### Navigation

On desktop, the header renders four tabs. On mobile (≤ 768 px), a fixed bottom navigation bar (`BottomNav.js`) replaces the header tabs and communicates tab changes via custom DOM events (`routeshred:set-tab` / `routeshred:tab-changed`). The middle two tabs (`routes`, `community`) are only shown when auth is enabled and the user is logged in.

| Tab | Content |
|-----|---------|
| `plan` | Route planning, elevation, export |
| `routes` | Saved routes panel |
| `community` | Group rides panel |
| `setup` | Bike profile, rider profile (FTP/weight) |

### State

All application state lives in a single Zustand store (`frontend/src/store/routeStore.js`). Components subscribe to slices they need.

Key state:
- `startPoint`, `endPoint`, `waypoints` — current route inputs
- `route` — calculated GeoJSON route (geometry + stats)
- `bikeType`, `rideType`, `preference` — routing parameters
- `riderProfile` — FTP, weight
- `bikeProfiles` — BRouter custom profiles loaded from backend
- `savedRoutes` — list of user's saved routes
- `activeTab` — currently visible panel

### Ride Personas

Four personas act as quick-select presets. Selecting one sets `rideType` and `preference` atomically.

| Persona | rideType | preference |
|---------|----------|------------|
| Coffee Ride | z2 | scenic |
| Bunch Ride | tt | fastest |
| Endurance | sst | scenic |
| Gravel | z2 | offroad |

`rideType` also controls the Power Zone Preview: a calculated watt range based on FTP (Z2, SST, TT, Threshold).

### Components

| File | Purpose |
|------|---------|
| `Header.js` | App bar with tabs and auth buttons |
| `MapComponent.js` | Leaflet map, markers, route polyline, POI layer |
| `RouteControls.js` | All planning UI: location inputs, personas, bike/ride setup, elevation, weather, export |
| `ElevationProfile.js` | Recharts elevation chart with stats |
| `LocationInput.js` | Address/POI search plus optional current-location shortcut |
| `SavedRoutesPanel.js` | Saved route list: save, load, rename, share, delete, filter by name or start-region radius |
| `GroupRidesPanel.js` | Group ride feed: create, edit, join, leave, participants, comments, linked route/Instagram actions |
| `RouteDetail.js` | Full-page route detail view (deep-link target) |
| `BottomNav.js` | Mobile bottom navigation bar — tab switching via custom events |
| `RouteTypeStats.js` | Terrain surface breakdown visualization |

### Mobile Layout

On narrow screens (≤ 768 px) the map and the active panel are stacked vertically. The panel appears as a bottom sheet with rounded top corners that overlaps the map. A drag-handle grip at the top of the sheet cycles through three snap heights:

| Snap | Sheet height | Map height |
|------|-------------|------------|
| `compact` | ~38 svh | ~56 dvh |
| `half` | ~66 svh | ~38 svh |
| `full` | 100 svh − header − nav | ~28 dvh |

The snap state is stored in `MapComponent` local state (`mobileSheetSnap`). Tapping or dragging the grip advances through `compact → half → full → compact`.

### i18n

`frontend/src/i18n.js` holds all UI strings in German (default) and English. Language is selected by `navigator.language`. The `t(key, vars)` helper resolves keys with optional `{{variable}}` interpolation.

---

## Backend

### Entry Point

`backend/src/server.js` loads `.env`, registers all routers, and starts Express on `PORT` (default `5050`).

### Routes → Services

| Route file | Mounted at | Service |
|------------|-----------|---------|
| `routing.js` | `/api/routing` | `routingService.js` |
| `elevation.js` | `/api/elevation` | `elevationService.js` |
| `export.js` | `/api/export` | `exportService.js` |
| `geocode.js` | `/api/geocode` | `geocodingService.js` |
| `auth.js` | `/api/auth` | `keycloakService.js` |
| `profile.js` | `/api/profile` | `profileService.js` |
| `savedRoutes.js` | `/api/routes` | `savedRouteService.js` |
| `groupRides.js` | `/api/group-rides` | `groupRideService.js` |
| `users.js` | `/api/users` | `keycloakService.js` + `profileService.js` |
| `tiles.js` | `/api/tiles` | `tileService.js` |

### Routing Service (`routingService.js`)

1. Receives start, end, optional waypoints, `bikeType`, `rideType`, `preference`.
2. Chooses engine: `ROUTING_ENGINE=brouter` (default) or `osrm`.
3. **BRouter path**: builds query string with selected `.brf` profile, calls `http://localhost:17777/brouter`, parses GeoJSON response, enriches coordinates with elevation.
4. **OSRM path**: calls public/self-hosted OSRM, converts route geometry.
5. Runs terrain analysis via Overpass (surface types, major roads, cycleways).
6. Fetches wind/weather from Open-Meteo forecast API and produces `weatherAlerts`.
7. Returns enriched route object with `geometry`, `distance`, `duration`, `weatherAlerts`, terrain stats.

For AI Roundtrip requests, `routingService.getRoute(..., { fast: true })` uses a shorter path: one direct routing request, no alternative search, no optional Overpass enrichments, and no weather/tempo adjustment. This keeps generated loops responsive while still returning a normal route object.

### AI Roundtrip Service (`openaiRoutePlannerService.js`)

The optional AI planner is exposed via `POST /api/routing/roundtrip` and requires normal API auth. It works in two stages:

1. Resolve the requested target area with `geocodingService`.
2. Ask OpenAI for compact structured loop ideas using the Responses API and a JSON schema.
3. Convert relative waypoint bearings into real waypoint coordinates around the target area. The target place itself is an anchor, not an automatic first via point.
4. Calculate the actual loop with the routing engine using the fast route path.
5. If the result exceeds the time budget by more than `AI_ROUNDTRIP_MAX_TIME_FACTOR`, retry with smaller loop radii.

OpenAI never returns final route geometry. It only proposes constrained loop candidates; the routing engine remains authoritative. If OpenAI times out and `AI_ROUNDTRIP_ALLOW_FALLBACK=true`, the service creates a deterministic fallback loop and still attempts route calculation.

### Elevation Service (`elevationService.js`)

- Primary: Open-Meteo elevation API (batched, configurable batch size)
- Fallback: Open-Elevation API
- Results cached to disk at `ROUTESHRED_CACHE_DIR`

### Export Service (`exportService.js`)

Generates TCX and GPX files directly from template strings (no XML library dependency).

- **TCX**: Course format — `Lap` summary + `Track`/`Trackpoint` list, capped at 500 points. Timestamps distributed proportionally using `route.duration`. Distance values from `route.distance`. Elevation from `coord[2]`.
- **GPX**: `trk/trkseg/trkpt` format, capped at 1000 points, elevation from `coord[2]`.

Both use `downsample()` for large coordinate arrays and `escapeXml()` for safe name/description encoding.

### Geocoding Service (`geocodingService.js`)

Two endpoints serve the `LocationInput` two-phase search:

- `GET /api/geocode/search/quick` — Nominatim only, results cached to disk, used at 150 ms debounce for instant address suggestions.
- `GET /api/geocode/search` — Nominatim + Overpass POI enrichment. At 650 ms debounce; reuses the quick Nominatim result from disk cache to avoid a second Nominatim request (respecting the 1 req/s rate limit).

POI categories include cafés, bike shops, water, viewpoints, and more. Overpass results are cached to disk. Geocoding cache TTL is configurable via `GEOCODING_CACHE_TTL_MS` (default: 30 days).

### Keycloak Service (`keycloakService.js`)

- Validates Bearer tokens using Keycloak's JWKS endpoint
- Extracts `sub`, `preferred_username`, `email` from token claims
- Exposes `requireAuth` Express middleware and `optionalAuth` for semi-protected routes

### Saved Route Service (`savedRouteService.js`)

Routes stored as JSON files in `ROUTESHRED_ROUTES_DIR`. Each file: `{id, ownerSub, name, visibility, sharedWith[], route, waypoints, createdAt}`. Route summaries include start/end coordinates where available so the frontend can filter saved routes by start-region radius. Visibility: `private` | `public` | `shared`.

### Tile Service (`tileService.js`)

Proxies Thunderforest map tiles to the browser. The API key never leaves the server.

- Validates style against a fixed whitelist (`cycle`, `landscape`, `outdoors`, `transport`, …)
- Checks disk cache first (`ROUTESHRED_CACHE_DIR/tiles/{style}/{z}/{x}/{y}.png`), TTL configurable via `TILE_CACHE_TTL_MS` (default 90 days)
- On cache miss: fetches from `tile.thunderforest.com` with the server-side API key, writes to cache asynchronously
- Returns 503 if `THUNDERFOREST_API_KEY` is not set (frontend falls back to plain OSM tiles)
- Rate-limited at 300 req/min per IP via `tileLimiter`

### Group Ride Service (`groupRideService.js`)

Group rides stored as JSON in `ROUTESHRED_GROUP_RIDES_DIR` or `ROUTESHRED_ROUTES_DIR/group-rides/`. Fields include: `title`, `description`, `meetingPoint`, `startAt`, `visibility`, `challenge`, `instagramUrl`, `routeId`, `routeName`, `routeOwnerSub`, `participants[]`, `comments[]`.

---

## Routing Engines

### BRouter (default)

Self-hosted on port 17777. Uses `.brf` profiles for precise bike routing (surface preference, road type weights, avoidance rules). RouteShred loads available custom profiles from the backend and exposes them in the Setup tab.

Segment tiles (`.rd5`) are fetched automatically when `BROUTER_AUTO_FETCH_SEGMENTS=true`.

### OSRM (fallback)

Used when `ROUTING_ENGINE=osrm` or when BRouter is unreachable. Calls the public OSRM demo server or a self-hosted instance. OSRM profiles (`cycling`) are less granular than BRouter but widely available.

---

## Data Flow: Route Calculation

```
User sets start/end → clicks Calculate
  → store.calculateRoute()
  → POST /api/routing/route
     → routingService: choose BRouter or OSRM
     → enrich with elevation (Open-Meteo)
     → terrain analysis (Overpass)
     → weather alerts (Open-Meteo forecast)
  → route stored in Zustand
  → MapComponent draws polyline
  → ElevationProfile renders chart
  → RouteControls shows weather alerts + terrain stats
```

Location input can come from three frontend paths: typed address/POI search (`LocationInput` → `/api/geocode/search`), map clicks/marker drags (`MapComponent`), or browser Geolocation (`navigator.geolocation`) for start, destination, or any waypoint. GPS requires a secure context (`https://` or `localhost`) and is allowed by Caddy's `Permissions-Policy: geolocation=(self)` header in production.

## Data Flow: Export / Share to Wahoo

```
User clicks export
  → POST /api/export/tcx or /api/export/gpx
  → exportService generates file
  → browser download  (desktop)
  OR
  → navigator.share({ files: [gpx] })  (mobile, Web Share API)
  → OS share sheet → Wahoo Companion App
```

---

## Authentication Flow

```
User clicks Login
  → keycloak-js redirects to Keycloak login page (custom theme)
  → Keycloak issues access token
  → frontend stores token, sends as Authorization: Bearer on all /api calls
  → backend requireAuth middleware validates token via JWKS
  → routes, profiles, group rides become available
```

Auth is entirely optional. Without `KEYCLOAK_ENABLED=true` the app runs in anonymous mode: route planning and export work, but Meine Routen and Community tabs are hidden.

---

## External APIs

| Service | Used for | Auth |
|---------|---------|------|
| Open-Meteo | Elevation + weather | None |
| Open-Elevation | Elevation fallback | None |
| Nominatim | Address search | None (rate limit: 1 req/s) |
| Overpass | POI + terrain data | None |
| Thunderforest | Map tiles (proxied via `/api/tiles`, key stays server-side) | `THUNDERFOREST_API_KEY` |
| OpenAI Responses API | Optional AI Roundtrip candidate planning | `OPENAI_API_KEY` |
| BRouter | Routing | None (self-hosted) |
| OSRM | Routing fallback | None |
