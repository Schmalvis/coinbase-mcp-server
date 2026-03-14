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

### Wallet Lifecycle (updated 2026-03-14)

Wallet addresses are persisted to disk and restored on boot to prevent address drift across
container restarts and image updates.

**How it works:**
- On first boot for a network, `CdpEvmWalletProvider.configureWithWallet()` creates a new EVM
  server wallet. The resulting address is written to `/app/data/<networkId>-address.txt`.
- On subsequent boots, the address file is read and passed as `address:` to `configureWithWallet()`.
  CDP returns the same server wallet, so the address is stable.
- If the address file is deleted or the data volume is lost, a new wallet is created and persisted.

**Deployment note:** The host bind-mount path (`WALLET_DATA_PATH`) must survive image updates.
Using a Docker named volume (default) is fine; a bind-mount to a fixed host path is better
because it can be backed up and inspected directly.

**Pre-seeding:** To force a specific wallet address on next boot (e.g. after recovery), write
the address to `/app/data/<networkId>-address.txt` before starting the container:
```bash
echo '0xYourAddress' > /path/to/data/base-mainnet-address.txt
```
The address must belong to a server wallet created with the same CDP API credentials.

### Logging
- Activity written as JSONL to `/app/data/activity.log`
- Log retention configurable via `LOG_RETENTION_DAYS` env var (default: 30)
- `trimOldLogs()` called on every boot to purge expired entries

### Multi-Network Support
Set `NETWORK_ID` to a comma-separated list to enable multiple networks (e.g. `base-sepolia,base-mainnet`).

In multi-network mode each tool gains a `network` enum parameter — the calling LLM specifies which
network to use per request. The default is the first network in the list. Single-network deployments
have no `network` parameter.

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

`/app/data` is mounted as a volume — used for:
- `activity.log` — JSONL activity log
- `<networkId>-address.txt` — persisted wallet address per network (e.g. `base-mainnet-address.txt`)
- `.wallet_idempotency_key` — legacy file from old `CdpWalletProvider`, no longer used but harmless

```yaml
volumes:
  - ${WALLET_DATA_PATH:-wallet_data}:/app/data
```

- `docker compose down` → **data is preserved**
- `docker compose down -v` → **data is deleted (irreversible) — wallet address lost**
- Set `WALLET_DATA_PATH=/host/path` in your `.env` to use a bind mount (recommended for production)
  - Directory must exist and be owned by UID 1000: `mkdir -p /path && chown 1000:1000 /path`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CDP_API_KEY_ID` | Yes | — | CDP v2 API key ID (from portal.cdp.coinbase.com → API Keys) |
| `CDP_API_KEY_SECRET` | Yes | — | CDP v2 API key secret |
| `CDP_WALLET_SECRET` | Yes | — | CDP wallet secret — used to authenticate wallet operations |
| `NETWORK_ID` | No | `base-sepolia` | Network ID, or comma-separated list e.g. `base-sepolia,base-mainnet` |
| `WEB_PORT` | No | `3002` | Port for the web UI |
| `LOG_RETENTION_DAYS` | No | `30` | Days to retain activity log entries |
| `WALLET_DATA_PATH` | No | (named volume) | Host path for bind-mount data storage (wallet files + activity log) |

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

## Deployment Context (Schmalvis home lab)

This server is deployed as a Portainer stack (`coinbase-mcp`, stack ID 67) on RPi5
(`192.168.68.139`), tracking this repo's `main` branch via Portainer GitOps with
`ForcePullImage: true`. Pushes to `main` trigger a GitHub Actions build; Portainer
redeploys on the next GitOps poll or manual webhook trigger.

**Active wallets (as of 2026-03-14):**
- `base-mainnet`: `0x7dD5Acd498BCF96832f82684584734cF48c7318D`
- `base-sepolia`: `0x9123528571C6aD8fe80eb0cC82f6a388311A3104`

**Data path on host:** `/home/pi/shared/docker/coinbase/data/`
(bind-mounted into container as `/app/data`; owned by pi/node, UID 1000)

To force a redeploy via Portainer API (when MCP `deploy_stack` fails with 409):
```bash
curl -sk -X PUT 'https://192.168.68.139:9443/api/stacks/67/git/redeploy?endpointId=5' \
  -H 'X-API-Key: <portainer-token>' \
  -H 'Content-Type: application/json' \
  -d '{"prune":false,"pullImage":true,"repositoryAuthentication":false}'
```

---

## Planned Improvements

The following features are prioritised for future implementation. Each includes enough
technical context for an AI assistant to implement without needing further research.

### 1. Wallet address visible in web UI

**Problem:** The web UI (port 3002) shows tools and logs but not the active wallet address(es).
When something goes wrong it requires querying `WalletActionProvider_get_wallet_details` to
find which wallet is in use.

**Solution:** Extend `startWebServer()` in `src/webServer.ts` — it already receives `address`
and `networks` as arguments. Add a `/api/status` endpoint returning:
```json
{ "networks": ["base-sepolia", "base-mainnet"], "addresses": { "base-sepolia": "0x...", "base-mainnet": "0x..." }, "startedAt": "ISO8601" }
```
Update the UI to show this prominently at the top of the page.

Note: `initNetwork()` currently only returns `address` for the primary network. Refactor
`main()` to collect a `Map<networkId, address>` and pass it to `startWebServer()`.

---

### 2. Emergency native transfer tool

**Problem:** If a wallet address changes unexpectedly (e.g. data volume lost), funds become
inaccessible until the wallet is restored. There is no quick recovery path via MCP.

**Solution:** Add a `WalletActionProvider_transfer_all_to` tool (or equivalent) that:
- Takes a destination address as input
- Estimates gas and transfers the full native balance minus gas
- Requires `ALLOW_EMERGENCY_TRANSFER=true` env var to be enabled (off by default)
- Is only exposed as an MCP tool when that env var is set
- Should work on both networks in multi-network mode

This is a safety escape hatch, not a trading tool. Guard it accordingly.

---

### 3. Wallet data export endpoint

**Problem:** `exportWallet()` on `CdpEvmWalletProvider` returns only `{ name, address }` —
the server-side key material is held by CDP and is not exportable. However, the `address` is
enough to restore the wallet (via `configureWithWallet({ address })`) as long as the CDP
credentials are the same.

**Solution:** Expose `GET /api/wallet` in `webServer.ts` returning the same data as
`/api/status` (addresses per network, credentials fingerprint, data path). This helps
diagnose which wallet is active and whether the address files are correctly populated,
without exposing private key material.

---

### 4. Activity log: include wallet address in boot entries

**Problem:** Boot log entries record `address` and `network` separately per entry. When
reviewing logs after an incident, it requires correlating multiple entries to understand
the full boot state.

**Solution:** Add a single consolidated `server_ready` log entry that includes all
networks and their addresses together:
```json
{ "event": "server_ready", "addresses": { "base-mainnet": "0x...", "base-sepolia": "0x..." }, "toolCount": 39, "networks": ["base-sepolia", "base-mainnet"] }
```
The individual per-network entries can remain for granularity.

---

## Development Notes

- `npm ci` uses `--ignore-scripts` in Docker for security
- Multi-stage Dockerfile: builder stage compiles TS, runtime stage installs prod-only deps
- Process runs as non-root `node` user (UID 1000) inside container
- MCP requires `stdin_open: true` and `tty: true` in docker-compose for stdio transport
