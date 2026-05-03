# RouteShred

[![Backend](https://github.com/thomeudt/routeshred/actions/workflows/node.js.yml/badge.svg?job=backend)](https://github.com/thomeudt/routeshred/actions/workflows/node.js.yml)
[![Frontend](https://github.com/thomeudt/routeshred/actions/workflows/node.js.yml/badge.svg?job=frontend)](https://github.com/thomeudt/routeshred/actions/workflows/node.js.yml)
![Status](https://img.shields.io/badge/status-beta-yellow)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

**Self-hosted, open-source route planner for cyclists who want control.**

RouteShred gives you BRouter's bike-optimised profiles, optional AI-assisted roundtrip planning, terrain-aware surface breakdowns, weather alerts, power-zone previews, and one-tap device export — running on your own server, with no subscription. Core routing stays self-hosted; optional integrations such as OpenAI, Open-Meteo, Thunderforest, Nominatim, and Overpass are only used when configured or needed for their feature.

> Works fully without login. Keycloak auth is optional and unlocks saved routes, group rides, and community features.

![RouteShred Teaser Screenshot](docs/screenshots/01-overview.png)

## Why RouteShred?

Most route planners are cloud services. RouteShred is a server you run yourself:

| | RouteShred | Komoot | Strava Routes | BRouter Web |
|---|---|---|---|---|
| Self-hosted | ✅ | ❌ | ❌ | ✅ (limited) |
| BRouter profiles | ✅ custom `.brf` | ❌ | ❌ | ✅ |
| **AI roundtrip planner** | **✅ opt-in** | ❌ | ❌ | ❌ |
| Terrain breakdown | ✅ surface % | paid | ❌ | ❌ |
| Weather alerts | ✅ wind/rain/UV | ❌ | ❌ | ❌ |
| Power-zone preview | ✅ FTP-based | ❌ | ❌ | ❌ |
| TCX/GPX export | ✅ free | paid | paid | ✅ |
| Share to Wahoo | ✅ | ❌ | ❌ | ❌ |
| Group rides | ✅ | paid | ❌ | ❌ |
| Open source (AGPL) | ✅ | ❌ | ❌ | ✅ |
| No subscription | ✅ | freemium | freemium | ✅ |

RouteShred is for clubs, coaches, and technically-minded riders who want those capabilities without handing data to a platform.

## Features

### Route Planning
- **Ride personas** — one-click presets for Coffee Ride, Bunch Ride, Endurance, and Gravel
- **Bike profiles** — load BRouter custom `.brf` profiles or use built-in road/gravel/MTB defaults
- **Route preferences** — Fastest, Scenic, Offroad
- **Location shortcuts** — use address/POI search, map clicks, or the current GPS position for start, destination, and waypoints
- **Waypoints** — add intermediate points, reorder, delete
- **Return route** — calculate round-trip automatically
- **GPX / FIT import** — load routes from Komoot, Strava, Garmin, etc.
- **AI Roundtrip** — pick a destination area, set a time budget, choose a persona; the planner proposes and calculates a fitting loop via OpenAI; opt-in via `AI_ROUNDTRIP_ENABLED=true`

### Analysis
- **Elevation profile** — interactive chart with gain/loss and gradient
- **Terrain breakdown** — surface type percentages (asphalt, gravel, trail…)
- **Weather alerts** — wind, rain, heat, UV, and crosswind warnings via Open-Meteo
- **Power zone preview** — FTP-based target watts for each ride type (Z2, SST, TT, Threshold)

### Export & Devices
- **TCX export** — Wahoo, Garmin, and other head units
- **GPX export** — universal format
- **Share to Wahoo** — Web Share API sends GPX directly to the Wahoo Companion App on mobile

### Social & Community *(requires Keycloak)*
- **Saved routes** — save, rename, delete, load back onto map
- **Sharing** — public links, per-user sharing, deep-link loading, region/radius filtering
- **Group rides** — create group ride events, link a route, join/leave, participants, comments, Instagram links
- **Community feed** — browse public rides from all users with challenge-coded cards

### Auth & Profiles *(optional)*
- **Keycloak OIDC** — optional; enables saved routes, profiles, and social features
- **Rider profile** — weight, FTP, bike type; persisted per user

## Tech Stack

### Frontend
- React 18, Zustand (state), React Leaflet, Recharts
- react-icons, keycloak-js 24, fit-file-parser
- i18n: German (default) + English

### Backend
- Node.js / Express
- BRouter (primary routing engine, self-hosted)
- OSRM (fallback routing engine)
- Open-Meteo (elevation + weather)
- Open-Elevation (elevation fallback)
- Nominatim + Overpass (geocoding + POI search)
- Keycloak 24 + PostgreSQL 16 (auth, optional)

## Installation

### Prerequisites

- Node.js >= 18.0.0, npm >= 9.0.0
- Docker + Docker Compose (for BRouter, Keycloak)

### Quick Start

```bash
git clone https://github.com/yourusername/routeshred.git
cd routeshred
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

Backend (`.env` at project root):
```env
PORT=5050
NODE_ENV=development
ROUTING_ENGINE=brouter
BROUTER_API=http://localhost:17777/brouter
OSRM_API=http://router.project-osrm.org
ROUTESHRED_ROUTES_DIR=./data/routes
ROUTESHRED_CACHE_DIR=./data/cache

# Optional AI Roundtrip planner
AI_ROUNDTRIP_ENABLED=false
OPENAI_MODEL=gpt-5-nano
# OPENAI_API_KEY=sk-...
```

Frontend (`frontend/.env`):
```env
REACT_APP_API_URL=/api
```

```bash
# Start frontend + backend (no BRouter)
npm run dev

# Start with BRouter Docker container
npm run dev:brouter

# Start with full Docker stack (BRouter + Keycloak)
npm run dev:brouter:docker
```

`npm run dev:brouter` auto-frees port 5050 if a previous instance is still running.

### BRouter

BRouter is the preferred routing engine. It uses bike-optimized `.brf` profiles and `.rd5` segment tiles.

```bash
# Build and start BRouter on localhost:17777
npm run brouter:build
npm run brouter:up

# Stop
npm run brouter:down
```

Volume mounts used by Docker Compose:
- `brouter-data/segments4` — `.rd5` routing tiles (auto-fetched if `BROUTER_AUTO_FETCH_SEGMENTS=true`)
- `brouter-data/customprofiles` — custom `.brf` profiles

Relevant env vars:
```env
BROUTER_SEGMENTS_DIR=../brouter-data/segments4
BROUTER_SEGMENTS_BASE_URL=https://brouter.de/brouter/segments4
BROUTER_AUTO_FETCH_SEGMENTS=true
```

If BRouter is unavailable, RouteShred can fall back to OSRM when `BROUTER_FALLBACK_TO_OSRM=true`. Production deployments should keep this explicit so accidental OSRM routing is easy to spot.

### Local Cache

Routing metadata and elevation data are cached on disk to avoid repeated API calls.

```env
ROUTESHRED_CACHE_DIR=./data/cache
ELEVATION_CACHE_TTL_MS=2592000000
OVERPASS_CACHE_TTL_MS=604800000
ELEVATION_OPEN_METEO_BATCH_SIZE=50
```

Cached data:
- Elevation profiles (Open-Meteo / Open-Elevation)
- Overpass cycleway, major-road, and POI lookup responses
- BRouter `.rd5` segments

### Keycloak Authentication

Authentication is optional. Without it, RouteShred runs in anonymous mode (route planning, export, and weather alerts all work). With Keycloak, users get saved routes, rider profiles, and community features.

```bash
docker compose up -d keycloak keycloak-db
```

Backend (`.env`):
```env
KEYCLOAK_ENABLED=true
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=routeshred
KEYCLOAK_CLIENT_ID=routeshred-frontend
ROUTESHRED_PROFILE_DIR=./data/profiles
```

Frontend (`frontend/.env`):
```env
REACT_APP_KEYCLOAK_ENABLED=true
REACT_APP_KEYCLOAK_URL=http://localhost:8080
REACT_APP_KEYCLOAK_REALM=routeshred
REACT_APP_KEYCLOAK_CLIENT_ID=routeshred-frontend
```

The Keycloak realm is imported automatically from `docs/keycloak/routeshred-realm.json`. The login page uses the custom RouteShred theme at `docs/keycloak/themes/routeshred/`.

### Custom Map Tiles

RouteShred proxies Thunderforest OpenCycleMap tiles through the backend — the API key never reaches the browser, and tiles are cached server-side for 90 days.

Backend (`.env`):
```env
THUNDERFOREST_API_KEY=your-key-here
TILE_CACHE_TTL_MS=7776000000   # 90 days (default)
```

Frontend (`frontend/.env`):
```env
REACT_APP_TILE_URL=/api/tiles/cycle/{z}/{x}/{y}.png
REACT_APP_TILE_ATTRIBUTION=© OpenCycleMap contributors
```

The default `REACT_APP_TILE_URL` is already set to `/api/tiles/cycle/{z}/{x}/{y}.png`. Without a `THUNDERFOREST_API_KEY` the backend returns 503 and the frontend falls back to plain OpenStreetMap tiles automatically.

Get a free Thunderforest key at https://www.thunderforest.com

## Production Deployment (Proxmox / Single Stack)

```bash
docker compose -f docker-compose.proxmox.yml up -d --build
```

Set at minimum in `.env`:
```env
PUBLIC_HOSTNAME=route.example.com
PUBLIC_BASE_URL=https://route.example.com
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=strong-password
KC_DB_USER=kc_routeshred
KC_DB_PASSWORD=strong-db-password
```

The Caddy reverse proxy routes:
- `/` → frontend
- `/api/*` → backend (port 5050)
- `/auth*` → Keycloak (port 8080)

The production Caddyfile also sends `Permissions-Policy: geolocation=(self)` so browser GPS can be used for start, destination, waypoints, and live map tracking. If you put the stack behind Nginx Proxy Manager or another outer proxy, terminate HTTPS there and proxy to Caddy over HTTP without forcing a second HTTPS redirect.

**Security notes for public deployments:**
- Set strong Keycloak admin and DB passwords before first start
- Run behind HTTPS — in the Proxmox stack this is usually the outer proxy (for example Nginx Proxy Manager) forwarding to Caddy on port `8080`
- The Thunderforest API key is kept server-side; it never reaches the browser
- Rate limiting is applied to the `/api/docs/manual` and routing endpoints
- Review `KEYCLOAK_ENABLED` — leave `false` if you only want a private planning tool with no user accounts

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full production guide.

## User Manual

A full end-user guide covering route planning, personas, export, Wahoo transfer, saved routes, group rides, and profile setup is at [docs/USER_MANUAL.md](docs/USER_MANUAL.md) and served at `/api/docs/manual` in a running instance.

A product positioning guide for differentiation vs. Komoot is at [docs/POSITIONING_VS_KOMOOT.md](docs/POSITIONING_VS_KOMOOT.md).

## How to Use

1. Open `http://localhost:3000`
2. Choose a ride persona (Coffee, Bunch, Endurance, Gravel) or configure manually
3. Set start and end points — type an address, use GPS, or click the map
4. Add waypoints as needed
5. Click **Calculate**
6. Inspect the elevation profile and weather alerts
7. Export as TCX or GPX, or use **An Wahoo senden** on mobile to share directly to the Wahoo Companion App

## API Endpoints

### Routing
- `POST /api/routing/route` — calculate route
- `POST /api/routing/roundtrip` — authenticated OpenAI-assisted roundtrip planning
- `POST /api/routing/analyze` — terrain analysis

### Auth & Profile
- `GET /api/auth/config` — Keycloak runtime config
- `GET /api/auth/me` — authenticated user claims
- `GET /api/profile` — load rider profile
- `PUT /api/profile` — save rider profile

### Elevation
- `POST /api/elevation/profile` — elevation for coordinates

### Export
- `POST /api/export/tcx` — export as TCX
- `POST /api/export/gpx` — export as GPX

### Saved Routes
- `GET /api/routes` — list visible routes (auth)
- `GET /api/routes/:id?owner=<sub>` — load route (auth)
- `POST /api/routes` — save new route (auth)
- `PUT /api/routes/:id` — update route (auth)
- `PATCH /api/routes/:id` — rename / update sharing (auth)
- `DELETE /api/routes/:id` — delete route (auth)
- `GET /api/routes/public/:owner/:id` — load public route (no auth required)

### Group Rides
- `GET /api/group-rides` — list visible group rides (auth)
- `POST /api/group-rides` — create group ride (auth)
- `PATCH /api/group-rides/:id` — update own group ride (auth)
- `DELETE /api/group-rides/:id` — delete own group ride (auth)
- `POST /api/group-rides/:id/join` — join (auth)
- `POST /api/group-rides/:id/leave` — leave (auth)
- `POST /api/group-rides/:id/comments` — add comment (auth)
- `GET /api/group-rides/public/:owner/:id` — load public group ride

### Geocoding
- `GET /api/geocode/search` — address / POI search

### Users
- `GET /api/users/search?q=<query>` — search users by name/email (auth)
- `GET /api/users/resolve?ids=<sub1,sub2>` — resolve user display names (auth)

### Tiles
- `GET /api/tiles/:style/:z/:x/:y.png` — proxied + cached Thunderforest tiles

### Docs
- `GET /api/docs/manual` — rendered user manual (HTML)
- `GET /api/docs/screenshots/:file` — manual screenshots

## Project Structure

```
routeshred/
├── frontend/
│   └── src/
│       ├── components/       # React components
│       ├── store/            # Zustand store (routeStore.js)
│       ├── styles/           # CSS per component
│       └── i18n.js           # DE / EN translations
├── backend/
│   └── src/
│       ├── routes/           # Express route handlers
│       ├── services/         # Business logic
│       ├── utils/            # Shared helpers (diskCache, etc.)
│       └── server.js         # Entry point
├── brouter-data/             # BRouter segments + custom profiles
├── data/                     # Runtime data (cache, routes, profiles)
├── docs/                     # Documentation + Keycloak realm/theme
├── deploy/                   # Caddy config for production
├── docker-compose.yml        # Development stack
└── docker-compose.proxmox.yml  # Production stack
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit (`git commit -m 'Add my feature'`)
4. Push and open a Pull Request

## License

GNU Affero General Public License v3.0 only (AGPL-3.0-only) — see [LICENSE](LICENSE)

Modified versions of RouteShred that are run as a network service must publish their source code under the same license.

## Acknowledgments

- [BRouter](https://brouter.de) — bike-optimized routing
- [OSRM](http://project-osrm.org) — fallback routing
- [Open-Meteo](https://open-meteo.com) — elevation and weather
- [OpenStreetMap](https://openstreetmap.org) — road network and POI data
- [Leaflet.js](https://leafletjs.com) — interactive maps
- [Keycloak](https://keycloak.org) — authentication

---

Built for cyclists, by cyclists.
