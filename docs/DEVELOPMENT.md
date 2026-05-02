# Bike Route Planner - Development Guide

## 🚀 Getting Started with Development

### Backend Development

#### File Structure
```
backend/
├── src/
│   ├── server.js           # Express app entry point
│   ├── routes/
│   │   ├── routing.js      # Routing endpoints
│   │   ├── elevation.js    # Elevation endpoints
│   │   └── export.js       # Export endpoints
│   └── services/
│       ├── routingService.js
│       ├── elevationService.js
│       └── exportService.js
```

#### Adding a New API Endpoint

1. Create route handler in `src/routes/`:
```javascript
// src/routes/new-feature.js
const express = require('express');
const router = express.Router();
const { newFeatureLogic } = require('../services/newFeatureService');

router.post('/', async (req, res) => {
  try {
    const result = await newFeatureLogic(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

2. Register in `src/server.js`:
```javascript
const newFeatureRouter = require('./routes/new-feature');
app.use('/api/new-feature', newFeatureRouter);
```

#### Testing Endpoints with cURL

```bash
# Create route
curl -X POST http://localhost:5000/api/routing/route \
  -H "Content-Type: application/json" \
  -d '{"start":[51.5,-0.1],"end":[51.4,-0.1],"bikeType":"road"}'

# Get elevation
curl -X POST http://localhost:5000/api/elevation/profile \
  -H "Content-Type: application/json" \
  -d '{"coordinates":[[51.5,-0.1],[51.4,-0.1]]}'
```

### Frontend Development

#### Component Structure
```
frontend/src/
├── components/
│   ├── MapComponent.js     # Main map interface
│   ├── RouteControls.js    # Control panel
│   ├── ElevationProfile.js # Chart
│   ├── Header.js           # Navigation
│   └── RouteDetail.js      # Route details page
├── store/
│   └── routeStore.js       # Zustand state management
└── styles/
    ├── Map.css
    ├── RouteControls.css
    └── ElevationProfile.css
```

#### Adding a New React Component

1. Create component file:
```javascript
// frontend/src/components/NewComponent.js
import React from 'react';
import { useRouteStore } from '../store/routeStore';
import '../styles/NewComponent.css';

function NewComponent() {
  const { route } = useRouteStore();
  
  return <div className="new-component">{/* JSX */}</div>;
}

export default NewComponent;
```

2. Add styles:
```css
/* frontend/src/styles/NewComponent.css */
.new-component {
  /* styles */
}
```

3. Import and use:
```javascript
import NewComponent from './components/NewComponent';

// In App.js or parent component
<NewComponent />
```

#### Using the Zustand Store

```javascript
import { useRouteStore } from '../store/routeStore';

function MyComponent() {
  const { route, calculateRoute, startPoint, setStartPoint } = useRouteStore();
  
  return (
    <button onClick={() => setStartPoint([51.5, -0.1])}>
      Set Start
    </button>
  );
}
```

#### Common State Management Tasks

```javascript
// Get current state
const route = useRouteStore(state => state.route);

// Set state
useRouteStore(state => state.setStartPoint([51.5, -0.1]));

// Subscribe to changes
useEffect(() => {
  const unsubscribe = useRouteStore.subscribe(
    state => state.route,
    route => console.log('Route updated:', route)
  );
  return unsubscribe;
}, []);
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 🔍 Debugging

### Backend Debugging
```bash
# Start with debugging enabled
node --inspect-brk backend/src/server.js

# Open Chrome DevTools
chrome://inspect

# Or use VS Code debugger - press F5
```

### Frontend Debugging
- Open Chrome DevTools (F12)
- React DevTools extension
- Redux DevTools for state inspection

## 📦 Bundle Size Analysis

```bash
npm install -g webpack-bundle-analyzer

# Analyze frontend bundle
cd frontend
npm run build
npx webpack-bundle-analyzer build/static/js/main.*.js
```

## 🐛 Common Issues & Solutions

### CORS Errors
**Problem**: Frontend can't connect to backend
**Solution**: 
```javascript
// In backend/src/server.js
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

### Port Already in Use
**Problem**: "Port 5000 already in use"
**Solution**:
```bash
lsof -i :5000
kill -9 <PID>
```

### Leaflet Marker Icons Not Showing
**Problem**: Markers appear without icons
**Solution**: Already fixed in MapComponent.js with icon URL configuration

### Route Not Appearing on Map
**Problem**: Route calculated but not visible
**Solution**:
1. Check if coordinates are in correct format [lon, lat]
2. Verify Leaflet Polyline coordinates are [lat, lon]
3. Check route.geometry structure

## 📚 Resources

- [OSRM Documentation](http://project-osrm.org)
- [Leaflet.js Guide](https://leafletjs.com)
- [React Hooks](https://react.dev/reference/react)
- [Zustand](https://github.com/pmndrs/zustand)
- [Express.js](https://expressjs.com)

## 🎨 Code Style

We use:
- **Frontend**: ESLint with React rules
- **Backend**: ESLint with Node.js rules

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint -- --fix
```

## 🚀 Performance Tips

1. **Frontend**:
   - Use React.memo for components
   - Lazy load heavy components
   - Use virtualization for long lists

2. **Backend**:
   - Cache OSRM responses
   - Use connection pooling
   - Optimize elevation API batching

3. **Data**:
   - Simplify route geometry (10m accuracy)
   - Cache elevation profiles
   - Use CDN for static assets

---

For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md)
For deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md)
