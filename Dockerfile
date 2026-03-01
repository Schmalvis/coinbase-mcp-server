# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy manifests first so npm install is cached unless deps change
COPY package.json package-lock.json ./
RUN npm install -g npm@11 && npm ci

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
RUN npm install -g npm@11 && npm ci --omit=dev && npm cache clean --force

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# ── Security: run as non-root ──────────────────────────────────────────────────
USER node

# Declare the volume AFTER the USER instruction.
# Docker will preserve ownership set above when the volume is first created.
VOLUME ["/app/data"]

# MCP servers communicate over stdio; no port needs to be exposed.
CMD ["node", "dist/index.js"]
