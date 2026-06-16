FROM node:22-bookworm-slim

# Install system dependencies for Playwright and chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright dependencies (for Chromium)
RUN npx -y playwright@1.57.0 install-deps chromium

WORKDIR /app

# Copy package configurations
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build shared, backend, and frontend
RUN npm run build

# Install Playwright Chromium browser binary
RUN npx playwright install chromium

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose backend API and frontend serving port
EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/data/amazon-monitor.sqlite

# Run start script
CMD ["npm", "start"]
