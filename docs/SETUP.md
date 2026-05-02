# Installation & Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install workspace dependencies
npm install --workspace=frontend
npm install --workspace=backend
```

### 2. Environment Setup

**Backend configuration** (`backend/.env`):
```env
PORT=5000
NODE_ENV=development
OSRM_API=http://router.project-osrm.org
```

**Frontend configuration** (`frontend/.env`):
```env
REACT_APP_API_URL=http://localhost:5000
```

### 3. Start Development

```bash
# From root directory - runs both services concurrently
npm run dev
```

This will:
- Start React frontend on `http://localhost:3000`
- Start Node.js backend on `http://localhost:5000`

## 📦 Production Build

```bash
npm run build

# Start production server
npm start
```

## 🧪 Testing

```bash
npm run test
```

## 🔌 API Usage Examples

### Calculate a Route
```bash
curl -X POST http://localhost:5000/api/routing/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": [51.5074, -0.1278],
    "end": [51.4769, -0.0005],
    "bikeType": "road",
    "preference": "scenic"
  }'
```

### Get Elevation Profile
```bash
curl -X POST http://localhost:5000/api/elevation/profile \
  -H "Content-Type: application/json" \
  -d '{
    "coordinates": [
      [51.5074, -0.1278],
      [51.4769, -0.0005]
    ]
  }'
```

### Export Route as TCX
```bash
curl -X POST http://localhost:5000/api/export/tcx \
  -H "Content-Type: application/json" \
  -d '{
    "route": { /* route object */ },
    "name": "My Route",
    "description": "A scenic gravel route"
  }' \
  --output route.tcx
```

## 🐳 Docker Setup (Optional)

### Build and Run
```bash
docker-compose up --build
```

## 📚 Project Structure

- `/frontend` - React web application
  - `src/components/` - React components
  - `src/store/` - State management
  - `src/styles/` - Component styles
  
- `/backend` - Node.js API server
  - `src/routes/` - API endpoints
  - `src/services/` - Business logic
  - `src/server.js` - Express app entry point

## 🎯 Common Development Tasks

### Add a new API endpoint
1. Create route file in `backend/src/routes/`
2. Create service in `backend/src/services/`
3. Register route in `backend/src/server.js`

### Add a new React component
1. Create component in `frontend/src/components/`
2. Create styles in `frontend/src/styles/`
3. Import and use in parent component

### Debug Backend
```bash
# Run with debugging
node --inspect-brk backend/src/server.js

# In Chrome: chrome://inspect
```

## 🚨 Troubleshooting

### Port already in use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Module not found errors
```bash
# Reinstall dependencies
rm -rf node_modules frontend/node_modules backend/node_modules
npm install
npm install --workspace=frontend
npm install --workspace=backend
```

### CORS errors
Ensure `REACT_APP_API_URL` matches backend URL in frontend `.env`

---

For more information, see [README.md](../README.md)
