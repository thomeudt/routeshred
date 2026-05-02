# Use official Node.js runtime
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY src ./src

# Expose port
EXPOSE 5000

# Start application
CMD ["npm", "start"]
