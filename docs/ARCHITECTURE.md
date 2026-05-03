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
│  /api/routes       /api/group-rides /api/users                   │
└──┬──────────┬───────────┬──────────────┬────────────────────────┘
   │          │           │              │
┌──▼───┐  ┌──▼──────┐ ┌──▼──────┐  ┌──▼─────────────────────────┐
│BRouter│  │ OSRM    │ │Open-    │  │ Keycloak (:8080)            │
│:17777 │  │(remote) │ │Meteo /  │  │ + PostgreSQL 16             │
│       │  │         │ │Open-Ele │  │ (optional, auth)            │
└──────┘  └─────────┘ └─────────┘  └────────────────────────────┘
```

In production (Proxmox stack) Caddy sits in front and routes `/`, `/api/*`, and `/auth*` to the respective containers.

---

## Frontend

### Navigation

The header renders four tabs. The middle two (`routes`, `community`) are only shown when auth is enabled and the user is logged in.

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
| `LocationInput.js` | Address/POI search (Nominatim + Overpass shortcuts) |
| `SavedRoutesPanel.js` | Saved route list: save, load, rename, share, delete |
| `GroupRidesPanel.js` | Group ride feed: create, edit, join, leave, comment |
| `RouteDetail.js` | Full-page route detail view (deep-link target) |
| `RouteTypeStats.js` | Terrain surface breakdown visualization |

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
| `users.js` | `/api/users` | `keycloakService.js` |

### Routing Service (`routingService.js`)

1. Receives start, end, optional waypoints, `bikeType`, `rideType`, `preference`.
2. Chooses engine: `ROUTING_ENGINE=brouter` (default) or `osrm`.
3. **BRouter path**: builds query string with selected `.brf` profile, calls `http://localhost:17777/brouter`, parses GeoJSON response, enriches coordinates with elevation.
4. **OSRM path**: calls public/self-hosted OSRM, converts route geometry.
5. Runs terrain analysis via Overpass (surface types, major roads, cycleways).
6. Fetches wind/weather from Open-Meteo forecast API and produces `weatherAlerts`.
7. Returns enriched route object with `geometry`, `distance`, `duration`, `weatherAlerts`, terrain stats.

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

- Address search: Nominatim
- POI search: Overpass API with category shortcuts (cafés, bike shops, water, viewpoints, etc.)
- Overpass results cached to disk

### Keycloak Service (`keycloakService.js`)

- Validates Bearer tokens using Keycloak's JWKS endpoint
- Extracts `sub`, `preferred_username`, `email` from token claims
- Exposes `requireAuth` Express middleware and `optionalAuth` for semi-protected routes

### Saved Route Service (`savedRouteService.js`)

Routes stored as JSON files in `ROUTESHRED_ROUTES_DIR`. Each file: `{id, ownerSub, name, visibility, sharedWith[], route, createdAt}`. Visibility: `private` | `public` | `shared`.

### Group Ride Service (`groupRideService.js`)

Group rides stored as JSON in `ROUTESHRED_ROUTES_DIR/group-rides/`. Fields include: `title`, `description`, `meetingPoint`, `startAt`, `visibility`, `coverPhoto`, `routeId`, `routeName`, `routeOwnerSub`, `participants[]`, `comments[]`.

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
| Thunderforest | Map tiles | API key (`REACT_APP_TILE_URL`) |
| BRouter | Routing | None (self-hosted) |
| OSRM | Routing fallback | None |
