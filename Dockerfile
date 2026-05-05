# Use an official Node.js runtime as a parent image
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application (Vite + Server)
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy built assets and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

# Expose the port the app runs on
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
