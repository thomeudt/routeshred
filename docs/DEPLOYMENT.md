# Bike Route Planner - Deployment Guide

## 🐳 Docker Deployment

### Quick Start with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Services will be available at:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:5000
```

### Individual Service Deployment

#### Backend
```bash
cd backend
docker build -t bike-route-backend .
docker run -p 5000:5000 -e NODE_ENV=production bike-route-backend
```

#### Frontend
```bash
cd frontend
docker build -t bike-route-frontend .
docker run -p 3000:3000 bike-route-frontend
```

## ☁️ Cloud Deployment

### Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create bike-route-planner

# Deploy backend
git push heroku main

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set OSRM_API=https://your-osrm-instance.com
```

### Vercel (Frontend Only)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel
```

### AWS / DigitalOcean / Linode

All services can be containerized and deployed to:
- **AWS ECS/EKS** - Container orchestration
- **DigitalOcean App Platform** - Simple deployment
- **Heroku** - Simple PaaS
- **Linode** - VPS hosting

## 🚀 Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use environment variables for secrets
- [ ] Configure HTTPS/SSL
- [ ] Set up error logging (Sentry, LogRocket)
- [ ] Configure rate limiting
- [ ] Enable CORS properly (not wildcard)
- [ ] Set up monitoring and alerts
- [ ] Configure backups for any persistent data
- [ ] Use self-hosted OSRM instance for reliability
- [ ] Configure CDN for static assets

## 📊 Performance Optimization

### Backend
```javascript
// Add caching middleware
const cache = require('express-cache-middleware');
app.use(cache.route());
```

### Frontend
```javascript
// Lazy loading
const MapComponent = React.lazy(() => import('./components/MapComponent'));
```

### Infrastructure
- Use CDN for static assets
- Enable gzip compression
- Use caching headers
- Load balance multiple backend instances

## 🔐 Security

- Keep dependencies updated: `npm audit fix`
- Use environment variables for sensitive data
- Validate all user inputs
- Rate limit API endpoints
- Use HTTPS only
- Set security headers (helmet.js)

---

For development setup, see [SETUP.md](./SETUP.md)
