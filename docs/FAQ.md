# Bike Route Planner - FAQ & Troubleshooting

## ❓ Frequently Asked Questions

### General Questions

**Q: Why not just use Komoot?**
A: This is fully open-source, customizable, and you control your data. You can self-host it, modify features, and support bike-specific routing without corporate constraints.

**Q: What data sources does this use?**
A: We use OpenStreetMap for road network, OpenCycleMap for the map layer, OSRM for routing, and Open Elevation for elevation data. Everything is open-source and free.

**Q: Can I use this offline?**
A: Currently no, but offline support is on the roadmap. For now, you need internet to calculate routes.

**Q: How accurate are the elevation profiles?**
A: Open Elevation API provides ~40% global coverage with ~10m accuracy in most regions. Self-hosted SRTM/DEM data can improve this.

---

### Setup & Installation

**Q: I'm getting "npm ERR! code ETARGET"**
A: This means a package version doesn't exist. Run:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Q: Port 3000 or 5000 already in use**
A: Kill the existing process:
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Q: "Cannot find module 'leaflet/dist/images/marker-icon.png'"**
A: This is already fixed in MapComponent.js. If you still see it, make sure you're using the latest version from GitHub.

---

### Running & Debugging

**Q: What if `npm run dev` doesn't start?**
A: Check for errors:
```bash
# Backend only
cd backend && npm run dev

# Frontend only
cd frontend && npm run dev
```

**Q: Backend API calls fail with CORS error**
A: Make sure:
1. Backend is running on http://localhost:5000
2. Frontend .env has `REACT_APP_API_URL=http://localhost:5000`
3. Backend CORS is configured (it is by default)

**Q: Route doesn't calculate**
A: 
1. Check backend is running (`curl http://localhost:5000/api/health`)
2. Make sure both start and end points are set
3. Check browser console for errors
4. Try with major cities first (routing may fail in remote areas)

---

### Features & Functionality

**Q: How do I export to Wahoo?**
A: Click "Export to TCX (Wahoo)" button - this downloads a .tcx file. Upload to Wahoo app or sync to your device.

**Q: What's the difference between "Fastest", "Scenic", and "Offroad"?**
A:
- **Fastest**: Optimized for time - uses main roads
- **Scenic**: Balanced - avoids highways, prefers nice routes
- **Offroad**: Prefers unpaved surfaces - best for gravel bikes

**Q: Can I import routes from other apps?**
A: Not yet, but it's on the roadmap. You can currently export from Komoot/Strava as GPX, then manually recreate them here.

**Q: Why no user accounts/cloud sync?**
A: To keep it simple and privacy-focused. Routes are stored locally in your browser. Cloud sync is planned for future versions.

---

### Map & Navigation

**Q: Map is blank or showing wrong location**
A: 
1. Check internet connection (tiles need to download)
2. Try zooming in/out
3. Clear browser cache: Settings → Clear browsing data

**Q: OpenCycleMap tile loading is slow**
A: This is normal with free tiles. For production, get a Thunderforest API key for better performance.

**Q: Can I use a different map layer?**
A: Yes! Modify `MapComponent.js`:
```javascript
// Change the TileLayer URL to any compatible provider
url="https://tile.opentopomap.org/{z}/{x}/{y}.png"
```

---

### Performance & Optimization

**Q: Routes take too long to calculate**
A: 
1. OSRM Demo server can be slow - set up self-hosted for production
2. Long routes (>100km) take longer anyway
3. Check your internet speed

**Q: App is slow on mobile**
A: 
1. Reduce map tile resolution
2. Turn off elevation profile for faster loading
3. Current version optimized for desktop

---

### Data & Privacy

**Q: What data is collected?**
A: None. We don't track users. All calculations happen locally or on your chosen servers.

**Q: Where are my routes stored?**
A: In your browser's local storage (localStorage). They're never sent anywhere unless you export them.

**Q: Can I self-host everything?**
A: Yes! That's the plan:
1. Host backend API yourself
2. Set up OSRM instance
3. Use your own elevation data
4. Host frontend yourself

---

### Development

**Q: How do I help contribute?**
A: See [DEVELOPMENT.md](./DEVELOPMENT.md) - we welcome contributions! Start with issues labeled "good first issue".

**Q: What's the tech stack?**
A: 
- **Frontend**: React 18, Leaflet, Zustand, Tailwind CSS
- **Backend**: Node.js, Express, OSRM, Open Elevation API

**Q: Can I use this for commercial purposes?**
A: It's MIT licensed, so yes - but give credit and open-source any modifications.

---

### Deployment & Production

**Q: How do I deploy to production?**
A: See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions for Heroku, Docker, AWS, etc.

**Q: Is this production-ready?**
A: The codebase is well-structured, but should be tested thoroughly before production use. Main considerations:
1. Set up self-hosted OSRM for reliability
2. Configure error tracking (Sentry)
3. Add rate limiting
4. Set up monitoring

**Q: How much does it cost to run?**
A: Mostly free:
- OSRM Demo: Free
- Open Elevation: Free
- OpenCycleMap tiles: Free (or ~$50/mo for commercial)
- Hosting: Depends (free tier options available)

---

## 🆘 Still Having Issues?

1. **Check the logs**:
```bash
# Backend logs
cd backend && npm run dev

# Frontend console
Press F12 in browser
```

2. **Search existing issues**:
   - GitHub Issues: https://github.com/yourusername/bike-route-planner/issues

3. **Ask in discussions**:
   - GitHub Discussions available

4. **Try the demo** first to isolate issues

---

## 📝 Reporting Bugs

When reporting bugs, please include:
1. **Steps to reproduce** the issue
2. **Expected behavior**
3. **Actual behavior**
4. **Browser/OS** you're using
5. **Error messages** from console
6. **Screenshots** if applicable

**Example good bug report**:
```
Title: Route calculation fails for Berlin to Munich

Steps:
1. Set start point to Berlin city center
2. Set end point to Munich city center  
3. Click "Calculate Route"

Expected: Route appears on map
Actual: Error message "Failed to calculate route"
Console error: CORS error from OSRM endpoint

Browser: Chrome 120 on macOS 13
```

---

For more detailed information:
- [Setup Guide](./SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [Development](./DEVELOPMENT.md)
- [Deployment](./DEPLOYMENT.md)
