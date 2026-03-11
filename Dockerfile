# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy manifests first — this layer is cached unless deps change
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# Compile TypeScript → dist/
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Create the persistence directory and hand ownership to the unprivileged
# 'node' user BEFORE the USER instruction so the running process can write.
RUN mkdir -p /app/data && chown node:node /app/data

# Install production-only dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# ── Security: run as non-root ──────────────────────────────────────────────────
# Web UI port (default 3000, configurable via WEB_PORT env var)
EXPOSE 3000

USER node

# Declare the volume AFTER the USER instruction.
# Docker will preserve ownership set above when the volume is first created.
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
