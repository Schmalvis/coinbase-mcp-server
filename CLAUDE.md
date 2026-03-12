# Coinbase AgentKit MCP Server — Claude Guide

## Project Overview

An MCP (Model Context Protocol) server that exposes Coinbase AgentKit tools to LLM clients. It runs over stdio transport and includes a companion web UI for observability.

**Stack:** TypeScript, Node.js 20, `@coinbase/agentkit`, `@modelcontextprotocol/sdk`
**Transports:** MCP over stdio (stdin/stdout) + Streamable HTTP (`/mcp`)
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

## Action Providers & Tools

| Provider | Tools |
|---|---|
| `walletActionProvider` | get_wallet_details, native_transfer |
| `cdpApiActionProvider` | request_faucet_funds |
| `cdpEvmWalletActionProvider` | get_swap_price, swap, list_spend_permissions, use_spend_permission |
| `erc20ActionProvider` | get_balance, transfer, approve, get_allowance, get_erc20_token_address |
| `erc721ActionProvider` | mint, transfer, get_balance |
| `wethActionProvider` | wrap_eth, unwrap_eth |
| `basenameActionProvider` | register_basename |
| `compoundActionProvider` | supply, withdraw, borrow, repay, get_portfolio |
| `morphoActionProvider` | deposit, withdraw |
| `superfluidStreamActionProvider` | create_stream, update_stream, delete_stream |
| `superfluidPoolActionProvider` | create_pool, update_pool |
| `superfluidQueryActionProvider` | query_streams |
| `superfluidWrapperActionProvider` | wrap_token |
| `superfluidSuperTokenCreatorActionProvider` | create_super_token |
| `defillamaActionProvider` | find_protocol, get_protocol, get_token_prices |
| `pythActionProvider` | fetch_price_feed, fetch_price |
| `ensoActionProvider` | route _(mainnet only — unavailable on base-sepolia)_ |

---

## Key Behaviours

### Wallet Lifecycle
- Uses the CDP v2 API (`CdpEvmWalletProvider`) — wallet is deterministically derived from `CDP_WALLET_SECRET`
- No local wallet file needed — the same secret always produces the same address
- On each boot, the wallet address is logged to stderr and the activity log

### Logging
- Activity written as JSONL to `/app/data/activity.log`
- Log retention configurable via `LOG_RETENTION_DAYS` env var (default: 30)
- `trimOldLogs()` called on every boot to purge expired entries

### Multi-Network Support
Set `NETWORK_ID` to a comma-separated list to enable multiple networks (e.g. `base-sepolia,base-mainnet`).

In multi-network mode each tool gains a `network` enum parameter — the calling LLM specifies which network to use per request. The default is the first network in the list. Single-network deployments have no `network` parameter.

### Transports
Two MCP transports run simultaneously on the same process:
- **stdio** — for local clients (Claude Desktop via `docker exec`)
- **HTTP (Streamable HTTP, stateless)** — at `http://<host>:3002/mcp`, for remote LAN clients

Both transports share the same tool handlers and activity log.

### Web UI
- Available at `http://localhost:3002` (configurable via `WEB_PORT`)
- Polls `/api/tools` and `/api/logs` every 5 seconds
- No auth — only expose port locally or behind a trusted network

---

## Data Persistence

`/app/data` is mounted as a Docker named volume (`wallet_data`) — used for the activity log only (wallet state lives in CDP, not locally):

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
| `CDP_API_KEY_ID` | Yes | — | CDP v2 API key ID (from portal.cdp.coinbase.com → API Keys) |
| `CDP_API_KEY_SECRET` | Yes | — | CDP v2 API key secret |
| `CDP_WALLET_SECRET` | Yes | — | CDP wallet secret — determines the wallet address |
| `NETWORK_ID` | No | `base-sepolia` | Network ID, or comma-separated list e.g. `base-sepolia,base-mainnet` |
| `WEB_PORT` | No | `3002` | Port for the web UI |
| `LOG_RETENTION_DAYS` | No | `30` | Days to retain activity log entries |
| `WALLET_DATA_PATH` | No | (named volume) | Host path for bind-mount log storage |

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
