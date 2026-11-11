# syntax=docker/dockerfile:1
#
# HMI Studio — production image.
# One container serves BOTH the built SPA and the API/Socket.IO on port 3100.
#
#   docker build -t hmi-studio .
#   docker run -p 3100:3100 -e HMI_JWT_SECRET=$(openssl rand -base64 48) \
#              -v hmi-data:/app/data hmi-studio
#
# Machine/PLC config lives in the data volume (data/machines.json) and is seeded
# to a mock machine on first run; edit it (or load a project) and restart.

# ---- Stage 1: build the frontend SPA ----
FROM node:20-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime (backend + built SPA) ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend

# Production dependencies only (bundling/esbuild not needed at runtime).
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Backend source, config template, and the built SPA (sibling dirs the app expects).
COPY backend/ ./
COPY config/ /app/config/
COPY --from=frontend /src/frontend/dist /app/frontend/dist
RUN mkdir -p /app/data

EXPOSE 3100

# Secure-by-default: without HMI_JWT_SECRET the app generates a random ephemeral
# secret at startup (sessions reset on restart). Pass a strong, persistent secret
# for production.
CMD ["node", "index.js"]
