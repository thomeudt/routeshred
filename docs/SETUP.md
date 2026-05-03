# RouteShred — Setup Guide

## Prerequisites

- Node.js >= 18.0.0, npm >= 9.0.0
- Docker + Docker Compose (needed for BRouter and Keycloak)

## 1. Install Dependencies

```bash
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

## 2. Configure Environment

**Backend** (`.env` at project root):

```env
PORT=5050
NODE_ENV=development

# Routing engine: brouter (recommended) or osrm
ROUTING_ENGINE=brouter
BROUTER_API=http://localhost:17777/brouter
OSRM_API=http://router.project-osrm.org

# Data directories
ROUTESHRED_ROUTES_DIR=./data/routes
ROUTESHRED_CACHE_DIR=./data/cache

# Auto-download BRouter segment tiles as needed
BROUTER_AUTO_FETCH_SEGMENTS=true
BROUTER_SEGMENTS_DIR=../brouter-data/segments4

# Optional AI Roundtrip planner
AI_ROUNDTRIP_ENABLED=false
OPENAI_MODEL=gpt-5-nano
AI_ROUNDTRIP_TIMEOUT_MS=20000
AI_ROUNDTRIP_MAX_TIME_FACTOR=1.18
# OPENAI_API_KEY=sk-...
```

**Frontend** (`frontend/.env`):

```env
REACT_APP_API_URL=/api
```

## 3. Start Development Servers

```bash
# Frontend + Backend (uses OSRM demo server for routing)
npm run dev

# Frontend + Backend + BRouter Docker container (recommended)
npm run dev:brouter

# Full Docker stack: BRouter + Keycloak + both app services
npm run dev:brouter:docker
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5050`

`npm run dev:brouter` automatically kills any process on port 5050 before starting.

GPS location shortcuts work on `localhost` during development. On phones and production domains they require HTTPS and browser location permission.

## 4. BRouter (Recommended)

BRouter gives you accurate bike-optimized routing with surface preferences.

```bash
# Build the BRouter image and start it
npm run brouter:build
npm run brouter:up
```

Stop:
```bash
npm run brouter:down
```

BRouter needs `.rd5` segment tiles for the region you want to route. With `BROUTER_AUTO_FETCH_SEGMENTS=true` they are downloaded on demand. Tiles are cached in `brouter-data/segments4/`.

To verify BRouter itself, use a valid routing request, not only a blank URL:

```bash
curl "http://localhost:17777/brouter?lonlats=13.4,52.5|13.45,52.52&profile=trekking&format=geojson"
```

## 5. Authentication (Optional)

Without Keycloak, RouteShred works for route planning and export. With Keycloak you get saved routes, rider profiles, and community features.

```bash
# Start Keycloak + its PostgreSQL database
docker compose up -d keycloak keycloak-db
```

Add to `.env`:
```env
KEYCLOAK_ENABLED=true
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=routeshred
KEYCLOAK_CLIENT_ID=routeshred-frontend
ROUTESHRED_PROFILE_DIR=./data/profiles
```

Add to `frontend/.env`:
```env
REACT_APP_KEYCLOAK_ENABLED=true
REACT_APP_KEYCLOAK_URL=http://localhost:8080
REACT_APP_KEYCLOAK_REALM=routeshred
REACT_APP_KEYCLOAK_CLIENT_ID=routeshred-frontend
```

The realm is imported automatically from `docs/keycloak/routeshred-realm.json` on first start.

Restart frontend and backend after changing env files.

To disable public signup, open the Keycloak Admin Console → Realm settings → Login and switch **User registration** off.

New RouteShred users get a default rider profile on first login if none exists yet.

## 6. AI Roundtrip Planner (Optional)

The AI planner is server-side only. Never put the OpenAI API key into `frontend/.env`.

```env
AI_ROUNDTRIP_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano
AI_ROUNDTRIP_TIMEOUT_MS=20000
AI_ROUNDTRIP_CANDIDATES=1
AI_ROUNDTRIP_ROUTE_CANDIDATES=1
AI_ROUNDTRIP_MAX_TIME_FACTOR=1.18
AI_ROUNDTRIP_ALLOW_FALLBACK=true
```

OpenAI proposes compact loop ideas from the destination area, time budget, bike profile, and ride persona. The real route geometry is still calculated by BRouter/OSRM. If OpenAI times out, the deterministic fallback loop can still be routed when `AI_ROUNDTRIP_ALLOW_FALLBACK=true`.

## 7. Map Tiles (Optional)

Without configuration the app falls back to plain OpenStreetMap tiles. For Thunderforest OpenCycleMap (cycling infrastructure, surface types, elevation tints), add your key to `.env`:

```env
THUNDERFOREST_API_KEY=your-key-here
```

The backend proxies all tile requests through `/api/tiles/cycle/{z}/{x}/{y}.png` and caches them on disk — the API key never reaches the browser.

Get a free key at https://www.thunderforest.com

## API Quick Reference

Backend runs on `http://localhost:5050`. All routes are under `/api`.

```bash
# Health check
curl http://localhost:5050/api/health

# Calculate a route
curl -s -X POST http://localhost:5050/api/routing/route \
  -H "Content-Type: application/json" \
  -d '{"start":[48.137,11.576],"end":[48.153,11.534],"bikeType":"road","preference":"scenic"}' \
  | jq .distance

# Export as GPX
curl -s -X POST http://localhost:5050/api/export/gpx \
  -H "Content-Type: application/json" \
  -d '{"route":{...},"name":"My Route"}' \
  --output route.gpx

# Address search
curl "http://localhost:5050/api/geocode/search?q=München+Marienplatz"
```

Authenticated AI roundtrip planning:

```bash
curl -s -X POST http://localhost:5050/api/routing/roundtrip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"start":[48.137,11.576],"target":"Starnberger See","timeBudgetMinutes":120,"bikeType":"road","persona":"endurance"}'
```

## Troubleshooting

**Port already in use**
```bash
lsof -i :5050
kill -9 <PID>
```

**Module not found / install errors**
```bash
rm -rf node_modules frontend/node_modules backend/node_modules
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

**BRouter not reachable**
```bash
# Check container status
docker compose ps brouter

# Check logs
docker compose logs brouter

# Confirm it answers
curl http://localhost:17777/brouter/version
```

**Keycloak login page not loading**

1. Confirm containers are healthy: `docker compose ps`
2. Check logs: `docker compose logs keycloak`
3. Wait 30–60 s after first start for realm import to complete
4. Open `http://localhost:8080` directly to verify Keycloak is up

**Route calculation returns OSRM error**

RouteShred only falls back to the OSRM demo server (`router.project-osrm.org`) when `BROUTER_FALLBACK_TO_OSRM=true` is set. The demo server is rate-limited and occasionally slow. For production, keep `ROUTING_ENGINE=brouter`, verify `BROUTER_API`, and start BRouter locally.

**GPS blocked in Safari/iOS**

Use `https://` or `localhost`, then allow location for Safari Websites in iOS Settings → Privacy & Security → Location Services. If you previously denied the domain, clear the website data or reset the per-site Safari permission.

---

For production deployment see [DEPLOYMENT.md](./DEPLOYMENT.md).
For architecture details see [ARCHITECTURE.md](./ARCHITECTURE.md).
