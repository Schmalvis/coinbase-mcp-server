# Coinbase AgentKit MCP Server — Claude Guide

## Project Overview

An MCP (Model Context Protocol) server that exposes Coinbase AgentKit tools to LLM clients. It runs over stdio transport and includes a companion web UI for observability.

**Stack:** TypeScript, Node.js 20, `@coinbase/agentkit`, `@modelcontextprotocol/sdk`
**Transport:** MCP over stdio (stdin/stdout)
**Container:** Docker via `docker-compose.yml`, image `ghcr.io/schmalvis/coinbase-mcp-server:latest`

---

## Source Layout

```
src/
  index.ts      — entry point: wallet bootstrap, MCP server setup, tool registration
  logger.ts     — JSONL activity logger + log trimmer (writes to /app/data/activity.log)
  webServer.ts  — embedded HTTP server for web UI (port 3002), serves /api/tools and /api/logs
```

---

## Key Behaviours

### Wallet Lifecycle
- Wallet data persisted to `/app/data/wallet_data.json`
- Idempotency key stored at `/app/data/.wallet_idempotency_key` — prevents duplicate wallet creation on rapid restarts (CDP returns same wallet within 24h for same key)
- Three modes: load existing JSON, import from `MNEMONIC_PHRASE` env var, or create new MPC wallet via CDP API
- On 429 / rate-limit errors, process waits 10 minutes before exiting (slows Docker restart loops)

### Logging
- Activity written as JSONL to `/app/data/activity.log`
- Log retention configurable via `LOG_RETENTION_DAYS` env var (default: 30)
- `trimOldLogs()` called on every boot to purge expired entries

### Web UI
- Available at `http://localhost:3002` (configurable via `WEB_PORT`)
- Polls `/api/tools` and `/api/logs` every 5 seconds
- No auth — only expose port locally or behind a trusted network

---

## Data Persistence

`/app/data` is mounted as a Docker named volume (`wallet_data`):

```yaml
volumes:
  - ${WALLET_DATA_PATH:-wallet_data}:/app/data
```

- `docker compose down` → **data is preserved**
- `docker compose down -v` → **data is deleted (irreversible)**
- Set `WALLET_DATA_PATH=/host/path` in your `.env` to use a bind mount instead (easier to back up)
  - Directory must exist and be owned by UID 1000: `mkdir -p /path && chown 1000:1000 /path`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CDP_API_KEY_NAME` | Yes | — | Coinbase Developer Platform API key name |
| `CDP_API_KEY_PRIVATE_KEY` | Yes | — | CDP API private key (supports `\n` escape sequences) |
| `NETWORK_ID` | No | `base-sepolia` | Blockchain network ID |
| `WEB_PORT` | No | `3002` | Port for the web UI |
| `LOG_RETENTION_DAYS` | No | `30` | Days to retain activity log entries |
| `MNEMONIC_PHRASE` | No | — | BIP-39 mnemonic for deterministic wallet import |
| `WALLET_DATA_PATH` | No | (named volume) | Host path for bind-mount wallet storage |

---

## Build & Run

```bash
# Local dev (requires .env file)
npm install
npm run dev

# Build TypeScript
npm run build

# Docker (production)
docker compose up -d

# Rebuild image locally
docker build -t coinbase-mcp-server .
```

---

## Development Notes

- `npm ci` uses `--ignore-scripts` in Docker for security
- Multi-stage Dockerfile: builder stage compiles TS, runtime stage installs prod-only deps
- Process runs as non-root `node` user (UID 1000) inside container
- MCP requires `stdin_open: true` and `tty: true` in docker-compose for stdio transport
- The Coinbase SDK's `apiClients.wallet.createWallet` is monkey-patched at boot to inject the `Idempotency-Key` header
