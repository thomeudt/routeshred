# 🔥 RouteShred

**The open-source bike route planner for road and gravel bikes.**

A modern web application for planning epic bike routes optimized for road and gravel bikes using **OpenCycleMap** and **OSRM** (Open Source Routing Machine).

## 🚀 Features

### Core Functionality
- **Smart Route Planning**: Calculate optimal routes using OSRM with bike-specific profiles
- **Multi-Bike Support**: Road bike, gravel bike, and MTB routing profiles
- **Route Preferences**: Choose between fastest, scenic, or offroad routes
- **Elevation Analysis**: Detailed elevation profiles with gain/loss calculations
- **Terrain Analysis**: Real-time terrain type detection using OSM data

### Import/Export
- **Wahoo Export**: Direct TCX export for Wahoo computers, Garmin, and other devices
- **GPX Format**: Universal GPX support for maximum compatibility
- **Route Sharing**: Save and share routes with community

### Map & UI
- **OpenCycleMap Integration**: Purpose-built cycling map with cycle routes
- **Interactive Map**: Click-to-set waypoints with live route preview
- **Elevation Chart**: Beautiful visualization of height profile
- **Responsive Design**: Works on desktop, tablet, and mobile

## 📋 Tech Stack

### Frontend
- **React 18** - UI framework
- **React Leaflet** - Interactive mapping
- **Zustand** - State management
- **Recharts** - Data visualization
- **Tailwind CSS** - Styling

### Backend
- **Node.js + Express** - Server framework
- **BRouter (optional, recommended)** - Bike-optimized routing engine
- **OSRM** - Fallback/open routing engine
- **Open Elevation API** - Elevation data
- **Axios** - HTTP client

### Data Sources
- **OpenStreetMap**: Road network and POI data
- **OpenCycleMap**: Cycling-specific map layer
- **Open Elevation**: Elevation data

## 🛠️ Installation

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/bike-route-planner.git
cd bike-route-planner
```

2. **Install dependencies** (monorepo setup)
```bash
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

3. **Configure environment**

Backend (`.env`):
```env
PORT=5050
NODE_ENV=development
OSRM_API=http://router.project-osrm.org
ROUTING_ENGINE=osrm
BROUTER_API=http://localhost:17777/brouter
```

Frontend (`.env` in frontend folder):
```env
REACT_APP_API_URL=/api
```

4. **Start development servers**
```bash
# From root directory - starts both frontend and backend
npm run dev

# Start dev mode with BRouter (builds from official BRouter repo and starts on localhost:17777)
npm run dev:brouter

# Start dev mode with Docker-managed BRouter + app stack
npm run dev:brouter:docker

# Start/stop only Keycloak
npm run keycloak:up
npm run keycloak:down

# Or run separately:
npm run dev --workspace=frontend  # Runs on http://localhost:3000
npm run dev --workspace=backend   # Runs on http://localhost:5050
```

`npm run dev:brouter` automatically frees port `5050` if a previous backend instance is still running.

### Enable BRouter

RouteShred supports BRouter as a first-class routing engine.

1. Run a BRouter server (local or Docker) on `http://localhost:17777/brouter`.
   Quick start via Docker Compose (builds from `abrensch/brouter` tag `v1.7.9`):

```bash
npm run brouter:build
npm run brouter:up
```

Stop it with:

```bash
npm run brouter:down
```

Persistent data directories used by Docker Compose:

- `brouter-data/segments4`: `.rd5` routing tiles
- `brouter-data/customprofiles`: custom `.brf` profiles

Note: segment files are not bundled. RouteShred backend can auto-fetch required `.rd5` tiles
for local BRouter into `brouter-data/segments4`.

Optional backend env settings for this behavior:

```env
BROUTER_SEGMENTS_DIR=../brouter-data/segments4
BROUTER_SEGMENTS_BASE_URL=https://brouter.de/brouter/segments4
BROUTER_AUTO_FETCH_SEGMENTS=true
```

### Local Data Cache

RouteShred can keep reusable routing metadata and elevation profiles on disk so
repeat requests do not need to hit public APIs every time.

Default cache location:

```env
ROUTESHRED_CACHE_DIR=./data/cache
```

Cached locally:

- Elevation profiles from Open-Meteo/Open-Elevation
- Overpass cycleway, major-road, and waypoint lookup responses
- BRouter `.rd5` routing segments in `brouter-data/segments4`
- User profiles in `data/profiles` (when Keycloak auth is enabled)

Useful cache settings:

```env
ELEVATION_CACHE_TTL_MS=2592000000
OVERPASS_CACHE_TTL_MS=604800000
ELEVATION_OPEN_METEO_BATCH_SIZE=50
```

Map display tiles are separate from routing/elevation data. To use local map
tiles, run a tile server such as TileServer GL, Martin, or a local raster tile
server, then point the frontend at it:

```env
REACT_APP_TILE_URL=http://localhost:8080/styles/cycle/{z}/{x}/{y}.png
REACT_APP_TILE_ATTRIBUTION=OpenStreetMap contributors
```
2. Configure backend `.env`:

```env
ROUTING_ENGINE=brouter
BROUTER_API=http://localhost:17777/brouter
```

3. Restart backend:

```bash
npm run dev --workspace=backend
```

4. Verify engine in health endpoint:

```bash
curl http://localhost:5050/api/health
```

If BRouter is unavailable, RouteShred automatically falls back to OSRM so routing keeps working.

### Authentication With Keycloak

RouteShred supports Keycloak as Identity Provider (OIDC) for user login and
persistent rider profiles.

1. Start Keycloak (realm import is automatic):

```bash
docker compose up -d keycloak keycloak-db
```

2. Configure backend (`.env` at project root):

```env
KEYCLOAK_ENABLED=true
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=routeshred
KEYCLOAK_CLIENT_ID=routeshred-frontend
ROUTESHRED_PROFILE_DIR=./data/profiles
```

3. Configure frontend (`frontend/.env`):

```env
REACT_APP_KEYCLOAK_ENABLED=true
REACT_APP_KEYCLOAK_URL=http://localhost:8080
REACT_APP_KEYCLOAK_REALM=routeshred
REACT_APP_KEYCLOAK_CLIENT_ID=routeshred-frontend
```

4. Restart frontend/backend and open `http://localhost:3000`.

The header now shows login/logout and a profile save action. Saved profile data
includes rider FTP/weight, selected bike profile and ride type.

## 🗺️ How to Use

1. Open your browser to `http://localhost:3000`
2. Select your bike type (Road, Gravel, MTB)
3. Choose route preference (Fastest, Scenic, Offroad)
4. Click on the map to set start point
5. Click again to set end point
6. Click "Calculate Route"
7. View the elevation profile and route statistics
8. Export to TCX (for Wahoo) or GPX (universal format)

## 📡 API Endpoints

### Routing
- `POST /api/routing/route` - Calculate bike route
- `POST /api/routing/analyze` - Analyze route terrain

### Auth/Profile
- `GET /api/auth/config` - Keycloak runtime config
- `GET /api/auth/me` - Authenticated user claims
- `GET /api/profile` - Load authenticated user profile
- `PUT /api/profile` - Save authenticated user profile

### Elevation
- `POST /api/elevation/profile` - Get elevation profile for coordinates

### Export
- `POST /api/export/tcx` - Export as TCX file
- `POST /api/export/gpx` - Export as GPX file

## 🏗️ Project Structure

```
bike-route-planner/
├── frontend/              # React web application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── store/        # Zustand store
│   │   └── styles/       # CSS stylesheets
│   └── package.json
├── backend/              # Node.js/Express API
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   └── server.js     # Express app
│   └── package.json
└── package.json          # Monorepo config
```

## 🔧 Advanced Setup

### Self-Hosted OSRM (Recommended for Production)

For production use, host your own OSRM instance with bike-optimized data:

```bash
# Using Docker
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/osrm/profiles/bike.lua /data/germany-latest.osm.pbf
docker run -d -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/germany-latest.osm.pbf
```

Update `.env` to point to your instance:
```env
OSRM_API=http://localhost:5000
```

### Using Custom OpenCycleMap Tiles

Add your Thunderforest API key to MapComponent.js:
```javascript
url="https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=YOUR_API_KEY"
```

Get a free API key at https://www.thunderforest.com

## 🤝 Contributing

Contributions welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OSRM** - Open Source Routing Machine
- **OpenStreetMap** - The free wiki world map
- **OpenCycleMap** - Cycling-specific map layer
- **Leaflet.js** - Interactive mapping library

## 📞 Support

For issues, questions, or suggestions:
- Open an [Issue](https://github.com/yourusername/bike-route-planner/issues)
- Email: your-email@example.com

## 🗺️ Roadmap

- [ ] Route history and saved routes
- [ ] User accounts and cloud sync
- [ ] Community route sharing platform
- [ ] Real-time traffic integration
- [ ] Offline map support
- [ ] Mobile app (React Native)
- [ ] Advanced filters (avoid hills, gravel only, etc.)
- [ ] Weather integration
- [ ] Nearby POI (cafe, repair shops)
- [ ] Social features (Strava integration)

---

Built with ❤️ for cyclists by cyclists
