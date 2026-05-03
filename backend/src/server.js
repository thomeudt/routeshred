const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routingRouter = require('./routes/routing');
const elevationRouter = require('./routes/elevation');
const exportRouter = require('./routes/export');
const geocodeRouter = require('./routes/geocode');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const savedRoutesRouter = require('./routes/savedRoutes');
const usersRouter = require('./routes/users');
const groupRidesRouter = require('./routes/groupRides');
const tilesRouter = require('./routes/tiles');
const docsRouter = require('./routes/docs');
const { getRoutingEngineInfo } = require('./services/routingService');
const { getKeycloakConfig } = require('./services/keycloakService');

const app = express();
const PORT = process.env.PORT || 5050;
const BODY_LIMIT = process.env.BODY_LIMIT || '10mb';
const IS_PROD = process.env.NODE_ENV === 'production';

// CORS — restrict to configured origin in production
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:3000', 'http://localhost:5050'];

app.use(helmet({
  crossOriginEmbedderPolicy: false, // Leaflet map tiles need cross-origin resources
  contentSecurityPolicy: false      // Served behind Caddy which handles CSP in production
}));

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin and server-to-server requests (no Origin header)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Rate limiting for expensive / externally-proxied endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const tightLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Tiles: generous enough for active map browsing (~10 visible tiles + panning),
// tight enough to prevent quota exhaustion via bulk enumeration.
const tileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Routes
app.use('/api/routing', apiLimiter, routingRouter);
app.use('/api/elevation', apiLimiter, elevationRouter);
app.use('/api/export', tightLimiter, exportRouter);
app.use('/api/geocode', tightLimiter, geocodeRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/routes', savedRoutesRouter);
app.use('/api/users', usersRouter);
app.use('/api/group-rides', groupRidesRouter);
app.use('/api/tiles', tileLimiter, tilesRouter);
app.use('/api/docs', docsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    routing: getRoutingEngineInfo(),
    auth: {
      enabled: getKeycloakConfig().enabled,
      realm: getKeycloakConfig().realm,
      clientId: getKeycloakConfig().clientId
    }
  });
});

// Error handling
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Request body exceeds the configured ${BODY_LIMIT} limit`
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: IS_PROD ? 'An error occurred' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚴 RouteShred backend running on http://localhost:${PORT}`);
  const routing = getRoutingEngineInfo();
  console.log(`📍 Routing engine: ${routing.configuredEngine.toUpperCase()}`);
  const tileKey = process.env.THUNDERFOREST_API_KEY;
  console.log(`🗺️ Tile proxy: ${tileKey ? 'Thunderforest (cached)' : 'disabled — set THUNDERFOREST_API_KEY'}`);
});

module.exports = app;
