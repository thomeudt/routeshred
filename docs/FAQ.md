# RouteShred — FAQ

## General

**Why not just use Komoot or RideWithGPS?**
RouteShred is fully self-hosted and open-source. You control your data, your routing profiles, and your feature set. There is no subscription fee and no corporate lock-in.

**What routing engine does RouteShred use?**
BRouter by default. BRouter uses OpenStreetMap data with bike-specific `.brf` profiles that understand surface type, road quality, and cycling infrastructure. OSRM is used as fallback when BRouter is unavailable.

**What map data does it use?**
OpenStreetMap for road network and terrain, Thunderforest OpenCycleMap for the default map layer, Open-Meteo for elevation and weather, and Nominatim + Overpass for address and POI search.

**Does it work offline?**
No. Routing, elevation, weather, and address search all require network access. Map tiles are cached by the browser after first load.

**How accurate are elevation profiles?**
Open-Meteo provides good global coverage with ~10 m resolution. Open-Elevation is used as fallback. For very precise analysis, consider integrating a local SRTM/DEM dataset.

---

## Setup & Installation

**What's the backend port?**
Port `5050`. Not 5000 — check your `.env` and any firewall rules accordingly.

**Do I need Docker?**
Docker is needed for BRouter and Keycloak. You can run the frontend and backend without Docker (`npm run dev`), using the public OSRM demo server for routing, but BRouter's quality is much better.

**Getting "Port 5050 already in use"**
```bash
lsof -i :5050
kill -9 <PID>
```

`npm run dev:brouter` handles this automatically.

**Getting npm install errors / "ETARGET"**
```bash
rm -rf node_modules frontend/node_modules backend/node_modules
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

**BRouter tiles are missing for my region**
Set `BROUTER_AUTO_FETCH_SEGMENTS=true` in `.env`. RouteShred will download tiles from `brouter.de` the first time a route is calculated through an area. Tiles are cached in `brouter-data/segments4/`.

---

## Running & Debugging

**How do I check which routing engine is active?**
```bash
curl http://localhost:5050/api/health
```
The response includes `routingEngine` and the BRouter availability status.

**Route calculation fails completely**
1. Confirm the backend is running: `curl http://localhost:5050/api/health`
2. Check browser console for the exact error message
3. If using BRouter, confirm it's running: `curl http://localhost:17777/brouter/version`
4. If both fail, the OSRM demo server fallback may be rate-limited — try again or set up local BRouter

**Weather alerts not appearing**
Weather alerts require Open-Meteo to return a forecast for the route coordinates. Check that the backend can reach `api.open-meteo.com`. Alerts only appear when significant wind, rain, heat, or UV conditions are detected.

**Elevation profile is flat or missing**
The backend enriches route coordinates with elevation after routing. Check that `ROUTESHRED_CACHE_DIR` is writable. Elevation is fetched from Open-Meteo; if it fails, Open-Elevation is tried next.

---

## Features

**What are the ride personas?**

| Persona | Ride Type | Route Preference |
|---------|-----------|-----------------|
| Coffee Ride | Z2 (endurance pace) | Scenic |
| Bunch Ride | TT (race pace) | Fastest |
| Endurance | SST (sweet spot) | Scenic |
| Gravel | Z2 | Offroad |

Selecting a persona sets both `rideType` and `preference` at once. The power zone preview shows target watts based on your FTP.

**What are rideTypes vs. preferences?**
- `rideType` (Z2, SST, TT, Threshold) controls the power zone display — it's about training intensity, not routing.
- `preference` (Fastest, Scenic, Offroad) controls how BRouter/OSRM selects the route — road type, surface, speed.

**Can I import routes from other apps?**
Yes. The import button accepts `.gpx` and `.fit` files. Export from Komoot, Strava, Garmin Connect, etc. as GPX and import here. Start, end, and intermediate waypoints are extracted automatically.

**How do I send a route to my Wahoo ELEMNT?**

On mobile: after calculating a route, open the Export section and tap **An Wahoo senden**. This uses the Web Share API to open your phone's native share sheet, where you select the Wahoo Companion App. The app receives the `.gpx` file and syncs it to the device.

On desktop: use **TCX exportieren** or **GPX exportieren** to download the file, then upload it via the Wahoo Companion App or Wahoo Cloud.

**How do I save a route?**
You need to be logged in (Keycloak). After calculating a route, type a name in the save bar at the top of the plan panel and click Save. Saved routes appear in the **Meine Routen** tab.

**Can I share a route?**
Yes. In Meine Routen, switch a route to **Public** or use per-user sharing. Public routes get a shareable link that works without login. Anyone with the link can load the route onto the map.

**What are group rides?**
Group rides are community events tied to a date, meeting point, and optionally a saved route. You create one in the Community tab. Other logged-in users can join, leave, and comment. Only the creator can edit or delete their rides.

**Is there a map layer switcher?**
Not as a UI control. The default tile layer is Thunderforest OpenCycleMap, proxied and cached by the backend. To change it, set `REACT_APP_TILE_URL` in `frontend/.env` to any `{z}/{x}/{y}` tile URL (e.g. OpenTopoMap). Without a `THUNDERFOREST_API_KEY` the backend falls back to plain OpenStreetMap tiles automatically.

---

## Data & Privacy

**What data is stored server-side?**
Only data you explicitly save: routes (if you click Save), rider profile (FTP, weight, bike type), and group rides. Calculated routes that are not saved are not persisted.

**Where are saved routes stored?**
As JSON files in `ROUTESHRED_ROUTES_DIR` on the server (`./data/routes` by default). Nothing is sent to any third party.

**Is Keycloak required?**
No. Without `KEYCLOAK_ENABLED=true` the app runs without authentication: route planning and export work, but saved routes and community features are unavailable.

**What does Keycloak store?**
User accounts (username + email) and session data, in its own PostgreSQL database. RouteShred stores your sub (user ID), routes, and profile separately in flat files.

---

## Contributing

**How do I get started contributing?**
See [DEVELOPMENT.md](./DEVELOPMENT.md). Look for issues labelled `good first issue` on GitHub. Bug reports and feature suggestions via GitHub Issues are also welcome.

**What's the tech stack?**
Frontend: React 18, Zustand, Leaflet, Recharts, react-icons.
Backend: Node.js, Express, BRouter, OSRM, Open-Meteo, Keycloak.
Everything is plain JavaScript (no TypeScript).

**MIT license — can I use this commercially?**
Yes. Attribution appreciated but not required.

---

## Still having issues?

1. **Check the backend logs**: `docker compose logs backend` or the console where you ran `npm run dev`
2. **Check the browser console**: F12 → Console tab
3. **Health check**: `curl http://localhost:5050/api/health`
4. **File a GitHub issue** with: steps to reproduce, expected vs. actual behaviour, browser/OS, and any error messages from the console.

**Bug report template**:
```
Title: [short description]

Steps to reproduce:
1. …
2. …

Expected: …
Actual: …

Browser: Chrome 120 / macOS 14
Backend logs: (paste relevant lines)
Console error: (paste)
```
