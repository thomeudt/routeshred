# Use official Node.js runtime
FROM node:18-alpine

WORKDIR /app

# Copy workspace package files from the repository root build context.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

# Install dependencies
RUN npm ci --workspace=backend --omit=dev

# Copy application code
COPY backend/src ./backend/src

# Expose port
EXPOSE 5050

WORKDIR /app/backend

# Start application
CMD ["npm", "start"]
