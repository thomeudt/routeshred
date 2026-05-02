# Bike Route Planner - Architecture & API Guide

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (3000)                     │
│  ├─ MapComponent (Leaflet + OpenCycleMap)                   │
│  ├─ RouteControls (UI for route parameters)                 │
│  ├─ ElevationProfile (Chart visualization)                  │
│  └─ Zustand Store (State management)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/REST API
┌─────────────────────┴───────────────────────────────────────┐
│               Node.js/Express Backend (5000)                  │
│  ├─ /api/routing/route (Route calculation)                  │
│  ├─ /api/routing/analyze (Terrain analysis)                 │
│  ├─ /api/elevation/profile (Elevation data)                 │
│  └─ /api/export/{tcx,gpx} (File export)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
    ┌───▼──┐     ┌────▼─────┐  ┌──▼────────┐
    │ OSRM │     │  OpenEL  │  │ OSM Data  │
    │(Routing)   │(Elevation)   │(Maps)     │
    └──────┘     └──────────┘  └───────────┘
```

## 🛣️ Routing Engine

### OSRM (Open Source Routing Machine)

**Format**: REST API calls to OSRM server

**Endpoints**:
- `GET /route/v1/{profile}/{coordinates}`
- `GET /match/v1/{profile}/{coordinates}`

**Profiles**:
- `car` - Road bikes (fast, smooth surfaces)
- `bike` - Gravel/MTB (any surface)
- `foot` - Off-road/hiking routes

**Example Request**:
```bash
curl "http://router.project-osrm.org/route/v1/bike/13.388860,52.517037;13.385983,52.496891?overview=full&steps=true"
```

### Production: Self-Hosted OSRM

For production, host your own OSRM instance with bike-optimized data:

```bash
# Download OSM data for your region
wget https://download.geofabrik.de/europe/germany-latest.osm.pbf

# Extract and prepare data
docker run -v $(pwd):/data osrm/osrm-backend \
  osrm-extract -p /opt/osrm/profiles/bike.lua \
  /data/germany-latest.osm.pbf

# Create compressed graph
docker run -v $(pwd):/data osrm/osrm-backend \
  osrm-partition /data/germany-latest.osrm

# Build routing data
docker run -v $(pwd):/data osrm/osrm-backend \
  osrm-customize /data/germany-latest.osrm

# Start the server
docker run -d -p 5000:5000 -v $(pwd):/data osrm/osrm-backend \
  osrm-routed --algorithm mld /data/germany-latest.osrm
```

Configure in `.env`:
```env
OSRM_API=http://your-osrm-server:5000
```

## 📈 Elevation Data

### Open Elevation API

Free, no-auth API for elevation data points.

**Request Format**:
```json
{
  "locations": [
    {"latitude": 51.5, "longitude": -0.1},
    {"latitude": 51.4, "longitude": -0.2}
  ]
}
```

**Response**:
```json
{
  "results": [
    {"latitude": 51.5, "longitude": -0.1, "elevation": 15.2},
    {"latitude": 51.4, "longitude": -0.2, "elevation": 12.8}
  ]
}
```

### Alternative Elevation APIs

- **Google Elevation API** - Paid, high accuracy
- **USGS 3DEP** - Free, US only
- **Mapzen Elevation** - Archived/Migrated

## 🗺️ Map Layers

### OpenCycleMap

```javascript
// Tile URL
https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=YOUR_KEY

// Free tiers:
// - Thunderforest (requires API key)
// - OpenCycleMap (free via Thunderforest)
// - CARTO (alternative, requires key)
```

### Base Layers

```javascript
// OpenStreetMap (Default)
https://tile.openstreetmap.org/{z}/{x}/{y}.png

// OpenTopoMap (Hillshade)
https://tile.opentopomap.org/{z}/{x}/{y}.png

// CARTO (Light/Dark)
https://cartodb-basemaps-{s}.global.ssl.fastly.net/light/{z}/{x}/{y}{r}.png
```

## 📊 API Response Examples

### GET Route
```json
{
  "geometry": {
    "type": "LineString",
    "coordinates": [[13.388, 52.517], [13.389, 52.516], ...]
  },
  "distance": 4523,
  "duration": 1024,
  "bikeType": "gravel",
  "preference": "scenic"
}
```

### GET Elevation Profile
```json
{
  "points": [
    {"lat": 51.5, "lon": -0.1, "elevation": 15.2, "distance": 0},
    {"lat": 51.49, "lon": -0.1, "elevation": 18.5, "distance": 1000}
  ],
  "stats": {
    "minElevation": 10,
    "maxElevation": 150,
    "totalGain": 450,
    "totalLoss": 380,
    "avgGradient": 2.15
  }
}
```

## 🔄 Data Flow

1. **User Action**: Click map to set start/end points
2. **Frontend**: Send route request (lat/lon, bike type, preference)
3. **Backend**: Call OSRM API with coordinates
4. **OSRM**: Calculate optimal route based on road network
5. **Backend**: Return route geometry + metadata
6. **Frontend**: Display route on map
7. **User Action**: Click to export
8. **Backend**: Generate TCX/GPX file from route
9. **Frontend**: Download file to local machine

## 🎯 Integration Points

### With Wahoo Devices
1. Export route as TCX file
2. Upload to Wahoo app / cloud
3. Sync to device
4. Navigate on device

### With Garmin Devices
1. Export as TCX or GPX
2. Connect device via USB
3. Copy file to device `/Garmin/NewFiles/`
4. Sync

### Import from Other Sources
- Komoot, Strava routes (export as GPX)
- Community routes (standard GPX format)

---

For backend development info, see `backend/src/services/`
For frontend components, see `frontend/src/components/`
