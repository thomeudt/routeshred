# RouteShred — Deployment Guide

## Recommended: Proxmox / Single-Host Docker Stack

The production-ready Docker Compose file is `docker-compose.proxmox.yml`. It runs all services in one stack behind a Caddy reverse proxy with automatic HTTPS.

### Services

| Service | Port (internal) | Purpose |
|---------|----------------|---------|
| `caddy` | 80, 443 | Reverse proxy + TLS |
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

2. **DNS**

   Point `PUBLIC_HOSTNAME` to your host IP. Open ports 80 and 443.

3. **Start the stack**

   ```bash
   docker compose -f docker-compose.proxmox.yml up -d --build
   ```

4. **Verify**

   ```bash
   curl https://route.example.com/api/health
   ```

### Caddy URL Routing

Defined in `deploy/Caddyfile`:

- `https://route.example.com/` → frontend (React build)
- `https://route.example.com/api/*` → backend (:5050)
- `https://route.example.com/auth*` → Keycloak (:8080)

TLS certificates are managed automatically by Caddy via Let's Encrypt.

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
| `BROUTER_API` | `http://localhost:17777/brouter` | BRouter base URL |
| `OSRM_API` | `http://router.project-osrm.org` | OSRM base URL |
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
- [ ] HTTPS enforced (Caddy handles this automatically)
- [ ] BRouter tiles downloaded for target region
- [ ] Keycloak admin password changed from default
- [ ] Keycloak DB password is strong and unique
- [ ] `./data/routes` backed up regularly
- [ ] `THUNDERFOREST_API_KEY` set (tiles are proxied and cached by backend, key stays server-side)
- [ ] Health endpoint responds: `curl https://your-domain/api/health`

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
