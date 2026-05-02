const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routingRouter = require('./routes/routing');
const elevationRouter = require('./routes/elevation');
const exportRouter = require('./routes/export');
const geocodeRouter = require('./routes/geocode');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const savedRoutesRouter = require('./routes/savedRoutes');
const usersRouter = require('./routes/users');
const groupRidesRouter = require('./routes/groupRides');
const { getRoutingEngineInfo } = require('./services/routingService');
const { getKeycloakConfig } = require('./services/keycloakService');

const app = express();
const PORT = process.env.PORT || 5050;
const BODY_LIMIT = process.env.BODY_LIMIT || '10mb';

// Middleware
app.use(cors());
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Routes
app.use('/api/routing', routingRouter);
app.use('/api/elevation', elevationRouter);
app.use('/api/export', exportRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/routes', savedRoutesRouter);
app.use('/api/users', usersRouter);
app.use('/api/group-rides', groupRidesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Bike Route Planner API is running',
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

  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚴 Bike Route Planner Backend running on http://localhost:${PORT}`);
  const routing = getRoutingEngineInfo();
  console.log(`📍 Routing engine: ${routing.configuredEngine.toUpperCase()}`);
  console.log(`🗺️ Map base: OpenCycleMap`);
});

module.exports = app;
