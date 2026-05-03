# RouteShred — Deployment Guide

## Recommended: Proxmox / Single-Host Docker Stack

The production-ready Docker Compose file is `docker-compose.proxmox.yml`. It runs all services in one stack behind an internal Caddy reverse proxy. In the current Proxmox setup, Caddy listens on host port `8080` and is usually placed behind Nginx Proxy Manager, OpenResty, or another edge proxy that terminates public HTTPS.

### Services

| Service | Port (internal) | Purpose |
|---------|----------------|---------|
| `reverse-proxy` | host 8080 → internal 80 | Internal Caddy reverse proxy |
| `frontend` | 3000 | React app (served as static build) |
| `backend` | 5050 | Express API |
| `brouter` | 17777 | BRouter routing engine |
| `keycloak` | 8080 | OIDC authentication |
| `keycloak-db` | 5432 | PostgreSQL for Keycloak |

### Setup

1. **Prepare environment**

   Copy `.env.example` to `.env` and set at minimum:

   ```env
   PUBLIC_HOSTNAME=route.example.com
   PUBLIC_BASE_URL=https://route.example.com

   KEYCLOAK_ADMIN=admin
   KEYCLOAK_ADMIN_PASSWORD=strong-password
   KC_DB_USER=kc_routeshred
   KC_DB_PASSWORD=strong-db-password

   # Thunderforest API key — backend proxies and caches tiles, key never reaches the browser
   THUNDERFOREST_API_KEY=your-key-here
   ```

2. **DNS / outer proxy**

   Point `PUBLIC_HOSTNAME` to your edge proxy. In Nginx Proxy Manager, create a proxy host for `PUBLIC_HOSTNAME` → `http://<proxmox-or-vm-ip>:8080`. Enable Websockets if available, use a normal Let's Encrypt certificate on the outer proxy, and avoid a second HTTPS redirect inside the app stack.

3. **Start the stack**

   ```bash
   docker compose -f docker-compose.proxmox.yml up -d --build
   ```

4. **Verify**

   ```bash
   curl https://route.example.com/api/health
   docker compose -f docker-compose.proxmox.yml logs --tail=120 backend reverse-proxy keycloak brouter
   ```

### Caddy URL Routing

Defined in `deploy/Caddyfile`:

- `/` → frontend (React build)
- `/api/*` → backend (:5050)
- `/auth*` → Keycloak (:8080)

Caddy also sets `Permissions-Policy: geolocation=(self)` so browser GPS can be used by the map and location fields. Public TLS is handled by the outer proxy in the Proxmox/Nginx Proxy Manager deployment. If you change Caddy to listen on the public hostname directly, then Caddy can manage Let's Encrypt itself, but do not run both Caddy and NPM as competing HTTPS redirectors for the same host.

### Updates

```bash
docker compose -f docker-compose.proxmox.yml pull
docker compose -f docker-compose.proxmox.yml up -d --build
```

### Stop / Teardown

```bash
# Stop (keep volumes)
docker compose -f docker-compose.proxmox.yml down

# Stop and remove all volumes (destroys routes + Keycloak DB)
docker compose -f docker-compose.proxmox.yml down -v
```

---

## Development Stack

For local development without TLS or Caddy:

```bash
docker compose up --build
```

Access:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5050`
- Keycloak: `http://localhost:8080`
- BRouter: `http://localhost:17777`

---

## BRouter Segment Tiles

BRouter needs `.rd5` segment files for the regions you want to route through. Either:

**Option A — Auto-fetch** (recommended for first boot):

```env
BROUTER_AUTO_FETCH_SEGMENTS=true
BROUTER_SEGMENTS_DIR=../brouter-data/segments4
BROUTER_SEGMENTS_BASE_URL=https://brouter.de/brouter/segments4
```

The backend downloads tiles on first use for the requested bounding box.

To test the BRouter REST endpoint, use a complete request. A bare `/brouter` request returns `400 Bad Request`, which is expected:

```bash
docker compose -f docker-compose.proxmox.yml exec backend \
  wget -S -O- "http://brouter:17777/brouter?lonlats=13.4,52.5|13.45,52.52&profile=trekking&format=geojson"
```

**Option B — Pre-download** (faster cold start):

```bash
# Download tiles for DACH region
wget -P brouter-data/segments4 https://brouter.de/brouter/segments4/E10_N45.rd5
wget -P brouter-data/segments4 https://brouter.de/brouter/segments4/E10_N50.rd5
# … add tiles as needed
```

Tile filenames follow `E{lon_tile}_{N|S}{lat_tile}.rd5` naming.

---

## Persistent Data Directories

| Path (host) | Container path | Content |
|-------------|---------------|---------|
| `./data/routes` | `/app/data/routes` | Saved routes + group rides (JSON) |
| `./data/profiles` | `/app/data/profiles` | Rider profiles (JSON) |
| `./data/cache` | `/app/data/cache` | Elevation + Overpass cache |
| `./brouter-data/segments4` | `/brouter/segments4` | BRouter routing tiles |
| `./brouter-data/customprofiles` | `/brouter/customprofiles` | Custom `.brf` profiles |
| `keycloak-db-data` (volume) | `/var/lib/postgresql/data` | Keycloak DB |

Back up `./data/routes` and the Keycloak DB volume to preserve user data.

---

## Environment Variables Reference

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5050` | HTTP port |
| `NODE_ENV` | `development` | `production` disables verbose errors |
| `ROUTING_ENGINE` | `brouter` | `brouter` or `osrm` |
| `BROUTER_API` | `http://localhost:17777/brouter` | BRouter base URL; Proxmox compose overrides this to `http://brouter:17777/brouter` |
| `OSRM_API` | `http://router.project-osrm.org` | OSRM base URL |
| `BROUTER_FALLBACK_TO_OSRM` | `false` in Proxmox | Allows OSRM fallback if BRouter is unavailable |
| `BROUTER_AUTO_FETCH_SEGMENTS` | `false` | Auto-download missing tiles |
| `BROUTER_SEGMENTS_DIR` | `../brouter-data/segments4` | Local tile storage |
| `KEYCLOAK_ENABLED` | `false` | Enable Keycloak auth |
| `KEYCLOAK_URL` | — | Keycloak base URL |
| `KEYCLOAK_REALM` | `routeshred` | Realm name |
| `KEYCLOAK_CLIENT_ID` | `routeshred-frontend` | Client ID |
| `ROUTESHRED_ROUTES_DIR` | `./data/routes` | Route file storage |
| `ROUTESHRED_PROFILE_DIR` | `./data/profiles` | Profile file storage |
| `ROUTESHRED_CACHE_DIR` | `./data/cache` | Disk cache directory |
| `ELEVATION_CACHE_TTL_MS` | `2592000000` (30 days) | Elevation cache TTL |
| `OVERPASS_CACHE_TTL_MS` | `604800000` (7 days) | Overpass cache TTL |
| `ELEVATION_PROVIDER_ORDER` | `open-meteo,open-elevation` | Elevation API priority |
| `AI_ROUNDTRIP_ENABLED` | `false` | Enables OpenAI-assisted roundtrip planning |
| `OPENAI_API_KEY` | — | Server-side OpenAI API key; never exposed to frontend |
| `OPENAI_MODEL` | `gpt-5-nano` | Model used for compact structured loop ideas |
| `OPENAI_API_URL` | `https://api.openai.com/v1/responses` | Responses API endpoint or compatible proxy |
| `AI_ROUNDTRIP_TIMEOUT_MS` | `20000` | Timeout for OpenAI planning |
| `AI_ROUNDTRIP_CANDIDATES` | `1` | AI loop ideas requested |
| `AI_ROUNDTRIP_ROUTE_CANDIDATES` | `1` | Ideas actually calculated by the routing engine |
| `AI_ROUNDTRIP_MAX_TIME_FACTOR` | `1.18` | Allowed duration overshoot before trying a smaller loop |
| `AI_ROUNDTRIP_ALLOW_FALLBACK` | `true` | Calculate a deterministic fallback loop if OpenAI is too slow |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `/api` | Backend API base URL |
| `REACT_APP_KEYCLOAK_ENABLED` | `false` | Enable Keycloak login UI |
| `REACT_APP_KEYCLOAK_URL` | — | Keycloak URL (shown to browser) |
| `REACT_APP_KEYCLOAK_REALM` | `routeshred` | Realm name |
| `REACT_APP_KEYCLOAK_CLIENT_ID` | `routeshred-frontend` | Client ID |
| `THUNDERFOREST_API_KEY` | — | Thunderforest key; enables OpenCycleMap via tile proxy |
| `TILE_CACHE_TTL_MS` | `7776000000` (90 days) | Tile cache TTL |
| `REACT_APP_TILE_URL` | `/api/tiles/cycle/{z}/{x}/{y}.png` | Map tile URL (proxy default) |
| `REACT_APP_TILE_ATTRIBUTION` | OSM attribution | Attribution string |

---

## Production Checklist

- [ ] `NODE_ENV=production` set
- [ ] All secrets in `.env`, not committed to git
- [ ] HTTPS enforced at the edge proxy or by public-facing Caddy
- [ ] Edge proxy forwards `X-Forwarded-Proto=https` and does not create redirect loops with Caddy
- [ ] BRouter tiles downloaded for target region
- [ ] Keycloak admin password changed from default
- [ ] Keycloak DB password is strong and unique
- [ ] `./data/routes` backed up regularly
- [ ] `THUNDERFOREST_API_KEY` set (tiles are proxied and cached by backend, key stays server-side)
- [ ] Health endpoint responds: `curl https://your-domain/api/health`
- [ ] GPS works on iOS/Android after granting browser location permission
- [ ] Keycloak client valid redirect URI matches `PUBLIC_BASE_URL/*`

---

## Self-Hosted OSRM (Alternative to BRouter)

If you prefer OSRM or need it as a reliable fallback:

```bash
# Download OSM data for your region
wget https://download.geofabrik.de/europe/germany-latest.osm.pbf

# Prepare routing data
docker run -v $(pwd):/data osrm/osrm-backend \
  osrm-extract -p /opt/osrm/profiles/bike.lua /data/germany-latest.osm.pbf
docker run -v $(pwd):/data osrm/osrm-backend osrm-partition /data/germany-latest.osrm
docker run -v $(pwd):/data osrm/osrm-backend osrm-customize /data/germany-latest.osrm

# Run
docker run -d -p 5000:5000 -v $(pwd):/data osrm/osrm-backend \
  osrm-routed --algorithm mld /data/germany-latest.osrm
```

Configure:
```env
ROUTING_ENGINE=osrm
OSRM_API=http://localhost:5000
```

---

See [DEVELOPMENT.md](./DEVELOPMENT.md) for local development setup.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.
