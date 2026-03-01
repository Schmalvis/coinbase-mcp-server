# Coinbase MCP Server

A server that lets AI assistants (like Claude) perform real cryptocurrency operations — checking balances, sending funds, deploying tokens, and interacting with the blockchain — using your Coinbase wallet.

---

## Table of Contents

- [What Is This?](#what-is-this)
- [How It Works (Big Picture)](#how-it-works-big-picture)
- [Web UI & Activity Log](#web-ui--activity-log)
- [Available Tools](#available-tools)
- [Prerequisites](#prerequisites)
- [Step 1: Get Your Coinbase API Keys](#step-1-get-your-coinbase-api-keys)
- [Step 2: Set Up the Project](#step-2-set-up-the-project)
- [Step 3: Configure Your Environment](#step-3-configure-your-environment)
- [Step 4: Run the Server](#step-4-run-the-server)
- [Deploying with Portainer (GitOps)](#deploying-with-portainer-gitops)
- [Connecting to an AI Assistant](#connecting-to-an-ai-assistant)
- [Your Wallet — What You Need to Know](#your-wallet--what-you-need-to-know)
- [Testnet vs Mainnet](#testnet-vs-mainnet)
- [Troubleshooting](#troubleshooting)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Security Tips](#security-tips)
- [Project Structure](#project-structure)

---

## What Is This?

This project is a **bridge** between AI assistants and your Coinbase crypto wallet.

Think of it like a translator:

```
You (talking to AI) → AI Assistant → This Server → Your Coinbase Wallet → Blockchain
```

Instead of logging into Coinbase manually, you can ask your AI assistant: *"What's my wallet balance?"* or *"Send 0.01 ETH to this address"* — and the AI will use this server to do it for you.

**This uses the Model Context Protocol (MCP)** — an open standard that lets AI assistants use external tools safely and consistently.

---

## How It Works (Big Picture)

1. You start this server on your computer (or in Docker / Portainer)
2. You connect your AI assistant (like Claude Desktop) to the server
3. The server creates or loads your Coinbase wallet
4. Your AI assistant can now call tools like "check balance", "transfer funds", etc.
5. The server talks to Coinbase on your behalf and returns the results
6. All activity is logged and viewable in the built-in web UI

Your wallet credentials live on **your machine only** — the AI never sees your private keys directly.

---

## Web UI & Activity Log

The server includes a built-in web interface for monitoring. Once running, open your browser at:

```
http://localhost:3002
```

(Or replace `localhost` with your server's IP if running remotely, e.g. in Portainer.)

### What you'll see

| Panel | Contents |
|-------|----------|
| **Available Tools** | All 12 AgentKit tools with name, description, and full JSON schema (click to expand) |
| **Activity Log** | Rolling live log of all server events — boot, tool calls, results, errors |

The log auto-refreshes every 5 seconds. Use **Pause** to freeze it for inspection, or **Clear view** to reset the display (the log file on disk is unaffected).

### Log persistence

Activity is written to `/app/data/activity.log` (inside the Docker volume, so it survives container restarts). Configure retention with the `LOG_RETENTION_DAYS` environment variable — entries older than this are purged automatically on startup.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3002` | Port the web UI listens on |
| `LOG_RETENTION_DAYS` | `30` | Days to keep activity log entries |
| `ACTIVITY_LOG_FILE` | `/app/data/activity.log` | Log file path (override for local dev/testing) |

---

## Available Tools

The server exposes 12 tools from [Coinbase AgentKit](https://github.com/coinbase/agentkit):

| Tool | Description |
|------|-------------|
| `get_wallet_details` | Retrieves wallet address and network information |
| `get_balance` | Gets the balance of a specific asset (ETH, USDC, etc.) |
| `request_faucet_funds` | Requests test tokens from the network faucet (testnet only) |
| `transfer` | Transfers an asset amount to a destination address |
| `trade` | Trades one asset for another via an on-chain DEX |
| `deploy_token` | Deploys a new ERC-20 token contract |
| `deploy_nft` | Deploys an ERC-721 NFT collection contract |
| `mint_nft` | Mints an NFT from an existing contract to an address |
| `wrap_eth` | Wraps ETH into WETH at a 1:1 ratio |
| `get_asset_price` | Fetches the current USD price of an on-chain asset |
| `register_basename` | Registers a Basename (Base-native ENS subdomain) |
| `wow_create_token` | Creates a WOW protocol memecoin with a bonding curve |

> The exact tool set is determined at runtime by the AgentKit library version. Newer versions may expose additional tools.

---

## Prerequisites

Before you start, make sure you have:

| Requirement | Version | How to Check |
|-------------|---------|--------------|
| Node.js | 20 or higher | `node --version` |
| npm | comes with Node.js | `npm --version` |
| Docker *(optional)* | any recent version | `docker --version` |
| A Coinbase account | — | [coinbase.com](https://www.coinbase.com) |

> **Don't have Node.js?** Download it from [nodejs.org](https://nodejs.org) — choose the "LTS" version.

---

## Step 1: Get Your Coinbase API Keys

This server uses the **Coinbase Developer Platform (CDP)** to access your wallet. You need two things: an API Key Name and a Private Key.

### 1.1 Create a CDP Account

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
2. Sign in with your Coinbase account (or create one)
3. Create a new project if prompted

### 1.2 Generate an API Key

1. In the CDP Portal, navigate to **API Keys** in the sidebar
2. Click **Create API Key**
3. Give it a name (e.g., `my-mcp-server`)
4. Select the permissions you need (at minimum: wallet read/write)
5. Click **Create and Download**

You will receive two pieces of information — **save these somewhere safe**:

- **API Key Name** — looks like: `organizations/abc123/apiKeys/xyz789`
- **Private Key** — a long block of text starting with `-----BEGIN EC PRIVATE KEY-----`

> **Warning:** You will only see the Private Key once. If you lose it, you must create a new key.

---

## Step 2: Set Up the Project

### Option A: Clone from Git

```bash
git clone https://github.com/Schmalvis/coinbase-mcp-server.git
cd coinbase-mcp-server
```

### Option B: You already have the files

Open your terminal and navigate to the project folder:

```bash
cd path/to/coinbase-mcp-server
```

### Install Dependencies

```bash
npm install
```

This downloads all the required libraries. It may take a minute.

---

## Step 3: Configure Your Environment

### For local development — use `.env`

Copy the example file and fill in your values:

```bash
# Mac/Linux:
cp .env.example .env

# Windows (PowerShell):
Copy-Item .env.example .env
```

Edit `.env`:

```env
CDP_API_KEY_NAME=organizations/YOUR_ORG_ID/apiKeys/YOUR_KEY_ID
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nYOUR_KEY\n-----END EC PRIVATE KEY-----

NETWORK_ID=base-sepolia

WEB_PORT=3002
LOG_RETENTION_DAYS=30
```

### For Portainer / Docker Compose — use `stack.env`

The `stack.env` file is committed to the repository and used by Portainer when deploying the stack. Edit it directly:

```env
CDP_API_KEY_NAME=organizations/YOUR_ORG_ID/apiKeys/YOUR_KEY_ID
CDP_API_KEY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\nYOUR_KEY\n-----END EC PRIVATE KEY-----\n"

NETWORK_ID=base-sepolia

WEB_PORT=3002
LOG_RETENTION_DAYS=30
```

### Formatting the Private Key

The private key must have its line breaks written as `\n` (not actual line breaks):

**Original (from CDP Portal):**
```
-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIAbcdef...
-----END EC PRIVATE KEY-----
```

**How it must look in the env file:**
```
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIAbcdef...\n-----END EC PRIVATE KEY-----
```

> **Tip:** In VS Code, enable "Regular Expressions" in Find & Replace, search for `\n`, replace with `\\n`.

---

## Step 4: Run the Server

### Option A: Node.js (local development)

```bash
# Development (with live reload):
npm run dev

# Production (compile first, then run):
npm run build
npm start
```

When the server starts successfully you'll see:
```
[log]  Trimmed activity log: kept N entries
[boot] Resuming existing wallet from /app/data/wallet_data.json
[boot] Loaded 12 AgentKit tool(s).
[web]  UI available at http://localhost:3002
[mcp]  Server running on stdio – ready for connections.
```

### Option B: Docker (pre-built image)

The image is automatically built and published to the GitHub Container Registry on every push to `main`. Run it directly:

```bash
docker run -i \
  --env-file .env \
  -p 3002:3002 \
  -v coinbase_wallet_data:/app/data \
  ghcr.io/schmalvis/coinbase-mcp-server:latest
```

### Option C: Docker Compose

```bash
docker compose up -d
```

This uses `stack.env` for configuration automatically. Stop with `docker compose down`.

### Available image tags

| Tag | When to use |
|-----|-------------|
| `latest` | Most recent build from `main` |
| `v1.2.3` | Pinned to a specific release |
| `1.2` | Latest patch within a minor version |
| `sha-a1b2c3d` | Exact build by git commit |

---

## Deploying with Portainer (GitOps)

This repository is set up for GitOps deployment via Portainer. The GitHub Actions workflow automatically builds and pushes a new `linux/arm64` image to `ghcr.io` on every push to `main`.

### One-time Portainer setup

1. **Add the registry** — Portainer → Settings → Registries → Add registry
   - Type: `Custom registry`
   - URL: `ghcr.io`
   - Username: `schmalvis`
   - Password: a GitHub Personal Access Token with `read:packages` scope

   *(Skip if you've made the package public on GitHub.)*

2. **Create the stack** — Portainer → Stacks → Add stack → Git Repository
   - Repository URL: `https://github.com/Schmalvis/coinbase-mcp-server`
   - Compose path: `docker-compose.yml`
   - Env file: `stack.env` *(or paste env vars directly into the Portainer UI)*
   - Enable **Auto update** if you want polling, or add a redeploy webhook for event-driven updates

3. **Deploy** — Portainer pulls the latest image from ghcr.io and starts the container.

4. **Access the web UI** — `http://<portainer-host-ip>:3002`

### Keeping deployments up to date

Every `git push` to `main`:
1. GitHub Actions builds a new `linux/arm64` image and pushes it to ghcr.io with the `latest` tag
2. If Portainer auto-update is enabled, it detects the new image digest and redeploys automatically
3. Or trigger redeployment manually via the Portainer UI

---

## Connecting to an AI Assistant

### Connecting Claude Desktop

1. Open Claude Desktop → **Settings** → **Developer** → **MCP Servers** → **Add Server**
2. Choose **"stdio"** as the transport type
3. Enter the command:

   **Node.js:**
   ```
   node /full/path/to/coinbase-mcp-server/dist/index.js
   ```

   **Docker:**
   ```
   docker run -i --env-file /full/path/to/.env -v coinbase_wallet_data:/app/data ghcr.io/schmalvis/coinbase-mcp-server:latest
   ```

4. Save and restart Claude Desktop.

### Verifying the connection

Ask Claude: *"What Coinbase tools do you have available?"* — it should list all 12 tools. You can also check the web UI at `:3002` to see the tool list and confirm the server is running.

---

## Your Wallet — What You Need to Know

### What kind of wallet is this?

This server uses a **non-custodial MPC wallet**:

- **Non-custodial** — only you control the funds
- **MPC (Multi-Party Computation)** — the private key is split; no single point of failure
- The wallet is created automatically on first run and reloaded on every subsequent start

### Where is the wallet stored?

| Runtime | Location |
|---------|----------|
| Node.js | `./data/wallet_data.json` (or `WALLET_DATA_FILE` path) |
| Docker / Portainer | Inside the `wallet_data` named volume at `/app/data/wallet_data.json` |

### Backing up your wallet

> If you lose `wallet_data.json` you lose access to any funds in that wallet.

**Docker backup:**
```bash
docker run --rm \
  -v coinbase_wallet_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/wallet_data.json /backup/wallet_data_backup.json
```

### ⚠️ Warning: deleting volumes

`docker compose down -v` **permanently deletes your wallet.** Always use `docker compose down` (no `-v`) unless you intentionally want to wipe it.

---

## Testnet vs Mainnet

### Testnet (`base-sepolia`) — Default

- Fake test tokens, zero risk
- Get free test ETH from the [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet)

### Mainnet (`base-mainnet`)

- Real transactions with real funds
- Mistakes are usually irreversible

Switch by changing `NETWORK_ID` in your env file. **Always start on testnet.**

---

## Troubleshooting

### `npm ci` fails in Docker build

If you see `The command '/bin/sh -c npm ci' returned a non-zero code: 1`, you are likely building locally instead of pulling the pre-built image. The `docker-compose.yml` no longer has a `build:` directive — it pulls from `ghcr.io` directly. Ensure the image has been built by GitHub Actions and that Portainer has credentials to access ghcr.io.

### Web UI not accessible

- Confirm port `3002` is not blocked by a firewall on the host
- Check that `WEB_PORT=3002` is set in your env file
- View container logs: `docker compose logs -f`

### The server fails to start

**Check environment variables are set:**
```bash
echo $CDP_API_KEY_NAME   # should not be empty
```

**Check key format** — `CDP_API_KEY_NAME` must look like:
```
organizations/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/apiKeys/yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

**Check private key** — must be all on one line with `\n` between sections (not real line breaks).

### "Cannot find module" error

Run `npm install` to install dependencies.

### The AI says it can't find the tools

1. Confirm the server is running (check for "server ready" in `docker compose logs`)
2. Verify the MCP configuration in your AI assistant points to the correct command/path
3. Restart the AI assistant after adding the server

### Wallet data file is corrupted

The server will warn and create a new wallet automatically. Move any funds out of the old wallet address first if possible.

---

## Frequently Asked Questions

**Q: Is this safe to use with real money?**

The server is secure, but always start with testnet. Crypto transactions are irreversible. Use mainnet only when you fully understand what you're doing.

---

**Q: Can Coinbase see my private keys?**

This uses MPC wallet architecture where the private key is never fully assembled in one place. Neither party alone can move funds. Review Coinbase's security documentation for details.

---

**Q: Can the AI drain my wallet without asking me?**

The AI can only call tools you've explicitly made available. You stay in control by reviewing actions before they execute. Never give an AI unconstrained access to a mainnet wallet with significant funds.

---

**Q: What happens if I restart the server?**

Your wallet is reloaded from `wallet_data.json` automatically. Address and funds remain the same. The activity log is also preserved across restarts.

---

**Q: Where do logs go?**

Two places: `stderr` (visible via `docker compose logs -f`) and the persistent activity log at `/app/data/activity.log`, which is displayed in the web UI. Configure retention with `LOG_RETENTION_DAYS`.

---

**Q: How do I run mock tests without real API keys?**

```bash
npm run test:ui
```

This starts the web server with 12 mock tools and seeded activity log entries — no Coinbase credentials required. Open `http://localhost:3002` to inspect the UI. All 19 API assertions run automatically.

---

## Security Tips

1. **Never commit your `.env` file to Git.** The `.gitignore` excludes it, but double-check before pushing. `stack.env` contains only placeholder values — fill in real values in Portainer's environment UI.

2. **Back up `wallet_data.json`** before upgrading or changing your Docker setup.

3. **Start with testnet** — get comfortable before using real funds.

4. **Review AI actions** before confirming mainnet transactions.

5. **Use minimal CDP permissions** — only grant what you actually need.

6. **Keep API keys private** — treat them like passwords.

7. **`docker compose down -v` deletes your wallet** — never run it if you have funds you want to keep.

---

## Project Structure

```
coinbase-mcp-server/
├── src/
│   ├── index.ts          ← Server entry point — wallet, AgentKit, MCP + web server wiring
│   ├── logger.ts         ← Activity log (JSONL file, configurable retention)
│   └── webServer.ts      ← Built-in HTTP monitoring UI (port 3002)
├── scripts/
│   └── test-ui.ts        ← Mock test runner (npm run test:ui)
├── .github/
│   └── workflows/
│       └── docker-publish.yml  ← CI: builds linux/arm64 image → ghcr.io on push to main
├── stack.env             ← Environment config for Docker / Portainer deployment
├── .env.example          ← Template for local development credentials
├── docker-compose.yml    ← Compose file (pulls pre-built image, exposes port 3002)
├── Dockerfile            ← Multi-stage build with BuildKit npm cache optimisation
├── package.json
└── tsconfig.json
```

The server on startup:
1. Trims activity log entries older than `LOG_RETENTION_DAYS`
2. Validates required environment variables
3. Loads (or creates) your MPC wallet and persists it
4. Connects to Coinbase AgentKit and loads all available tools
5. Starts the MCP stdio transport for AI assistant communication
6. Starts the HTTP web UI on `WEB_PORT`

---

*Built on [Coinbase AgentKit](https://github.com/coinbase/agentkit) and the [Model Context Protocol](https://modelcontextprotocol.io).*
