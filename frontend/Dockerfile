# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Build-time variables for CRA (embedded into static bundle)
ARG REACT_APP_API_URL=/api
ARG REACT_APP_KEYCLOAK_ENABLED=true
ARG REACT_APP_KEYCLOAK_URL=http://localhost/auth
ARG REACT_APP_KEYCLOAK_REALM=routeshred
ARG REACT_APP_KEYCLOAK_CLIENT_ID=routeshred-frontend
ARG REACT_APP_TILE_URL=https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=007b5abe80db44699c19474ee8d9500b
ARG REACT_APP_TILE_ATTRIBUTION=&copy; OpenCycleMap

ENV REACT_APP_API_URL=$REACT_APP_API_URL \
	REACT_APP_KEYCLOAK_ENABLED=$REACT_APP_KEYCLOAK_ENABLED \
	REACT_APP_KEYCLOAK_URL=$REACT_APP_KEYCLOAK_URL \
	REACT_APP_KEYCLOAK_REALM=$REACT_APP_KEYCLOAK_REALM \
	REACT_APP_KEYCLOAK_CLIENT_ID=$REACT_APP_KEYCLOAK_CLIENT_ID \
	REACT_APP_TILE_URL=$REACT_APP_TILE_URL \
	REACT_APP_TILE_ATTRIBUTION=$REACT_APP_TILE_ATTRIBUTION

# Copy workspace package files from the repository root build context.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

# Install dependencies
RUN npm ci --workspace=frontend

# Copy source
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public

# Build React app
RUN npm run build --workspace=frontend

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install simple HTTP server
RUN npm install -g serve

# Copy built app from build stage
COPY --from=build /app/frontend/build ./build

# Expose port
EXPOSE 3000

# Start server
CMD ["serve", "-s", "build", "-l", "3000"]
