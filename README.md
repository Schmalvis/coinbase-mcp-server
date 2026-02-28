# Coinbase MCP Server

A server that lets AI assistants (like Claude) perform real cryptocurrency operations — checking balances, sending funds, and interacting with the blockchain — using your Coinbase wallet.

---

## Table of Contents

- [What Is This?](#what-is-this)
- [How It Works (Big Picture)](#how-it-works-big-picture)
- [Prerequisites](#prerequisites)
- [Step 1: Get Your Coinbase API Keys](#step-1-get-your-coinbase-api-keys)
- [Step 2: Set Up the Project](#step-2-set-up-the-project)
- [Step 3: Configure Your Environment](#step-3-configure-your-environment)
- [Step 4: Run the Server](#step-4-run-the-server)
- [Using the Pre-Built Docker Image](#using-the-pre-built-docker-image)
- [Connecting to an AI Assistant](#connecting-to-an-ai-assistant)
- [Your Wallet — What You Need to Know](#your-wallet--what-you-need-to-know)
- [Testnet vs Mainnet](#testnet-vs-mainnet)
- [Troubleshooting](#troubleshooting)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Security Tips](#security-tips)

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

1. You start this server on your computer (or in Docker)
2. You connect your AI assistant (like Claude Desktop) to the server
3. The server creates or loads your Coinbase wallet
4. Your AI assistant can now call tools like "check balance", "transfer funds", etc.
5. The server talks to Coinbase on your behalf and returns the results

Your wallet credentials live on **your machine only** — the AI never sees your private keys directly.

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

### Option A: Clone from Git (if you haven't already)

```bash
git clone https://github.com/your-username/coinbase-mcp-server.git
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

The server needs your API keys. These are stored in a file called `.env` which lives on your computer and is **never shared** or uploaded anywhere.

### 3.1 Create the `.env` File

Copy the example file:

```bash
# On Mac/Linux:
cp .env.example .env

# On Windows (Command Prompt):
copy .env.example .env

# On Windows (PowerShell):
Copy-Item .env.example .env
```

### 3.2 Edit the `.env` File

Open `.env` in any text editor (Notepad, VS Code, etc.) and fill in your values:

```env
# Your API Key Name from the CDP Portal
# Example: organizations/abc123def456/apiKeys/xyz789abc123
CDP_API_KEY_NAME=organizations/YOUR_ORG_ID/apiKeys/YOUR_KEY_ID

# Your Private Key — paste the entire block including the header/footer lines
# IMPORTANT: Replace actual newlines with \n (backslash + n)
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENT_HERE\n-----END EC PRIVATE KEY-----

# Which blockchain network to use
# Use "base-sepolia" for testing (free fake money)
# Use "base-mainnet" for real transactions
NETWORK_ID=base-sepolia
```

### 3.3 Formatting the Private Key

The private key must have its line breaks written as `\n` (not actual line breaks). Here's how:

**Original key (what you copy from CDP):**
```
-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIAbcdef...
...more lines...
-----END EC PRIVATE KEY-----
```

**How it must look in `.env`:**
```
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIAbcdef...\n...more lines...\n-----END EC PRIVATE KEY-----
```

> **Tip:** In most text editors, use Find & Replace to replace newline characters with `\n`. In VS Code, enable "Regular Expressions" in the search bar and search for `\n`, replace with `\\n`.

---

## Step 4: Run the Server

You have two ways to run the server: directly with Node.js, or using Docker.

### Option A: Run with Node.js (Simpler)

**For development/testing:**
```bash
npm run dev
```

**For production use:**
```bash
npm run build   # compile the code (do this once)
npm start       # run the server
```

When the server starts successfully, you'll see output like:
```
[MCP Server] Wallet loaded from /app/data/wallet_data.json
[MCP Server] Loaded 12 AgentKit tools
[MCP Server] Coinbase AgentKit MCP server ready
```

### Option B: Run with Docker (Recommended for always-on use)

Docker packages everything into a container that runs the same way on any machine.

**First time setup:**
```bash
docker compose up --build
```

**After the first time:**
```bash
docker compose up
```

**Run in the background:**
```bash
docker compose up -d
```

**Stop the server:**
```bash
docker compose down
```

> **Your wallet data is saved automatically** in a Docker "volume" (a persistent storage area). It survives container restarts. See [Your Wallet — What You Need to Know](#your-wallet--what-you-need-to-know) for more details.

---

## Using the Pre-Built Docker Image

A Docker image is automatically built and published to the GitHub Container Registry on every push to `main`. You can pull and run it directly — no need to clone the repository or compile anything.

### Pull the image

```bash
docker pull ghcr.io/malvis/coinbase-mcp-server:latest
```

To pin to a specific version (recommended for stability):

```bash
docker pull ghcr.io/malvis/coinbase-mcp-server:v1.0.0
```

### Run the pre-built image

```bash
docker run -i \
  --env-file .env \
  -v coinbase_wallet_data:/app/data \
  ghcr.io/malvis/coinbase-mcp-server:latest
```

You still need a local `.env` file with your Coinbase API credentials — see [Step 3](#step-3-configure-your-environment).

### Available image tags

| Tag | When to use |
|-----|-------------|
| `latest` | Most recent build from `main` — always up to date |
| `v1.2.3` | Pinned to a specific release — most stable for production |
| `1.2` | Tracks the latest patch within a minor version |
| `sha-a1b2c3d` | Exact build by git commit — maximum traceability |

### Making customizations

If you want to modify the server (change tools, add logic, etc.):

1. Fork or clone the repository
2. Make your changes in `src/index.ts`
3. Build your own image:

```bash
docker build -t my-coinbase-mcp-server .
```

Or push to your own GitHub repo — the included workflow will automatically publish your customized image to `ghcr.io/YOUR_USERNAME/coinbase-mcp-server`.

---

## Connecting to an AI Assistant

Once the server is running, you connect your AI assistant to it.

### Connecting Claude Desktop

1. Open Claude Desktop
2. Go to **Settings** → **Developer** → **MCP Servers**
3. Click **Add Server**
4. Choose **"stdio"** as the transport type
5. Enter the command to run the server:

   **If using Node.js:**
   ```
   node /full/path/to/coinbase-mcp-server/dist/index.js
   ```

   **If using Docker:**
   ```
   docker run -i --env-file /full/path/to/coinbase-mcp-server/.env -v coinbase_wallet_data:/app/data coinbase-agentkit-mcp:latest
   ```

6. Save and restart Claude Desktop
7. You should now see Coinbase tools available in your conversations

### Verifying the Connection

In Claude Desktop, start a new conversation and ask:
> *"What Coinbase tools do you have available?"*

Claude should list the available tools like wallet balance, transfer funds, etc.

---

## Your Wallet — What You Need to Know

### What Kind of Wallet Is This?

This server uses a **non-custodial MPC wallet** — a type of crypto wallet with special security properties:

- **Non-custodial** means only you control the funds — Coinbase cannot spend them for you
- **MPC (Multi-Party Computation)** means the private key is split into pieces; no single point of failure
- The wallet is created automatically the first time you run the server

### Where Is the Wallet Stored?

| How You're Running | Wallet Location |
|--------------------|-----------------|
| Node.js directly | `/app/data/wallet_data.json` (on your machine) |
| Docker | Inside a Docker volume named `wallet_data` |

### Backing Up Your Wallet

> **This is important.** If you lose `wallet_data.json`, you may lose access to funds in that wallet.

**To back up (Node.js):** Copy `/app/data/wallet_data.json` to a safe location.

**To back up (Docker):**
```bash
# Export the wallet data to your current directory
docker run --rm -v coinbase_wallet_data:/data -v $(pwd):/backup alpine cp /data/wallet_data.json /backup/wallet_data_backup.json
```

### WARNING: Deleting the Wallet Volume

Running this command **permanently deletes your wallet data**:
```bash
docker compose down -v   # ← The -v flag deletes volumes!
```

`docker compose down` (without `-v`) is safe and keeps your wallet.

---

## Testnet vs Mainnet

### Testnet (base-sepolia) — Default

- **Use for:** Learning, testing, development
- **Money:** Fake test tokens with no real value
- **Getting test funds:** Use a "faucet" — websites that give free test tokens
  - [Coinbase Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)
- **Risk:** Zero — you can't lose real money

### Mainnet (base-mainnet)

- **Use for:** Real transactions with actual cryptocurrency
- **Money:** Real ETH and tokens with real value
- **Risk:** Real — mistakes can result in permanent loss of funds

To switch networks, change `NETWORK_ID` in your `.env` file:

```env
# For testing (safe):
NETWORK_ID=base-sepolia

# For real transactions:
NETWORK_ID=base-mainnet
```

> **Start with the testnet** until you're confident everything works correctly.

---

## Troubleshooting

### The server fails to start

**Check 1: Environment variables are set**
```bash
# Should print your key name, not empty
echo $CDP_API_KEY_NAME
```

If empty, your `.env` file isn't being loaded. Make sure it's in the project root directory.

**Check 2: The key format is correct**

The `CDP_API_KEY_NAME` must look like:
```
organizations/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/apiKeys/yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

**Check 3: Private key has `\n` instead of real newlines**

Open your `.env` file and make sure the private key is all on one line with `\n` characters between sections.

---

### "Cannot find module" error

You haven't installed dependencies yet. Run:
```bash
npm install
```

---

### "Permission denied" on wallet file

The server can't write to the data directory. Try:
```bash
# Create the data directory with correct permissions
mkdir -p /app/data
chmod 755 /app/data
```

Or when using Docker, make sure you're using the volume:
```bash
docker compose up  # Not: docker run without -v
```

---

### Docker: Container exits immediately

MCP over stdio requires an interactive terminal. Make sure you're using `docker compose` (the `docker-compose.yml` already has the correct settings), or add `-it` flags when using `docker run`.

---

### The AI says it can't find the tools

1. Make sure the server is actually running (check for the "server ready" message)
2. Verify your AI assistant's MCP configuration points to the correct path
3. Restart the AI assistant after adding the server

---

### Wallet data file is corrupted

If `wallet_data.json` is corrupted, the server will log a warning and create a new wallet automatically. The old wallet address will no longer be accessible — move any funds out before this happens.

---

## Frequently Asked Questions

**Q: Is this safe to use with real money?**

A: The server itself is secure, but always start with the testnet. Mistakes in crypto transactions (wrong address, wrong amount) are usually irreversible. Use mainnet only when you understand exactly what you're doing.

---

**Q: Can Coinbase see my private keys?**

A: This server uses an MPC wallet architecture where the private key is never fully assembled in one place. Coinbase's CDP platform is designed so that neither party alone can move funds. However, always review Coinbase's security documentation for the latest details.

---

**Q: Can the AI drain my wallet without asking me?**

A: The AI can only call tools that you've explicitly made available through this server. You remain in control by choosing which tools to enable and by reviewing what the AI is doing before it executes. Never give an AI unconstrained access to a mainnet wallet with significant funds.

---

**Q: What happens if I restart the server?**

A: Your wallet is saved to disk (`wallet_data.json`). The server loads it on startup automatically. Your wallet address and funds remain the same.

---

**Q: Can I use multiple wallets?**

A: Currently, the server manages one wallet per running instance. To use multiple wallets, you would need to run multiple instances with different data directories and environment variables.

---

**Q: What networks are supported?**

A: Currently `base-sepolia` (testnet) and `base-mainnet`. Base is an Ethereum Layer 2 blockchain by Coinbase, which means lower fees and faster transactions than Ethereum mainnet.

---

**Q: Where do logs go?**

A: The server writes status messages to `stderr` (the error output stream). This keeps `stdout` clean for MCP protocol communication. When running with Docker, view logs with:
```bash
docker compose logs -f
```

---

## Security Tips

1. **Never commit your `.env` file to Git.** The `.gitignore` already excludes it, but double-check before pushing.

2. **Back up your `wallet_data.json`** before upgrading or changing your Docker setup.

3. **Start with testnet** — get comfortable with how everything works before using real funds.

4. **Review AI actions** before confirming any transaction on mainnet. Understand exactly what is being sent and where.

5. **Use minimal permissions** — when creating your CDP API key, only grant the permissions you actually need.

6. **Keep your API keys private** — treat them like passwords. Don't share them in screenshots, chat logs, or emails.

7. **The `-v` flag in `docker compose down -v` deletes your wallet.** Never run this if you have funds in your testnet or mainnet wallet that you want to keep.

---

## Project Structure (For the Curious)

```
coinbase-mcp-server/
├── src/
│   └── index.ts          ← Main server code (all the logic lives here)
├── .env.example          ← Template for your API credentials
├── .env                  ← Your actual credentials (never share this!)
├── docker-compose.yml    ← Docker setup with persistent wallet storage
├── Dockerfile            ← Instructions to build the Docker container
├── package.json          ← Project dependencies and run commands
└── tsconfig.json         ← TypeScript language settings
```

The server (`src/index.ts`) does the following on startup:
1. Reads your API credentials from environment variables
2. Loads (or creates) your MPC wallet
3. Saves the wallet to disk for next time
4. Connects to Coinbase AgentKit and loads all available tools
5. Starts listening for tool calls from your AI assistant via MCP

---

*Built on [Coinbase AgentKit](https://github.com/coinbase/agentkit) and the [Model Context Protocol](https://modelcontextprotocol.io).*
