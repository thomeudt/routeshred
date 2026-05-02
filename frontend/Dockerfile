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

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src
COPY public ./public

# Build React app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install simple HTTP server
RUN npm install -g serve

# Copy built app from build stage
COPY --from=build /app/build ./build

# Expose port
EXPOSE 3000

# Start server
CMD ["serve", "-s", "build", "-l", "3000"]
