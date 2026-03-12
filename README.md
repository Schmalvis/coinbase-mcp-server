# Coinbase AgentKit MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants direct access to your Coinbase wallet — check balances, transfer funds, trade assets, interact with DeFi protocols, and query on-chain data, all through natural language.

```
You → Claude / VS Code → This MCP Server → Coinbase AgentKit → Base Blockchain
```

---

## Available Tools

| Category | Tools |
|----------|-------|
| Wallet | `get_wallet_details`, `native_transfer` |
| Tokens (ERC-20) | `get_balance`, `transfer`, `approve`, `get_allowance` |
| NFTs (ERC-721) | `mint`, `transfer`, `get_balance` |
| WETH | `wrap_eth`, `unwrap_eth` |
| Swaps & routing | `get_swap_price`, `swap`, `route` (mainnet) |
| Basenames | `register_basename` |
| Compound | `supply`, `withdraw`, `borrow`, `repay`, `get_portfolio` |
| Morpho | `deposit`, `withdraw` |
| Superfluid | streams, pools, super tokens, wrapping |
| DeFiLlama | `find_protocol`, `get_protocol`, `get_token_prices` |
| Pyth | `fetch_price_feed`, `fetch_price` |
| CDP | `request_faucet_funds` (testnet), `get_swap_price`, `swap` |

See [CLAUDE.md](CLAUDE.md) for the full tool list per provider.

---

## Connecting via HTTP (LAN / remote)

The server exposes a Streamable HTTP MCP endpoint at `/mcp`. Add to `mcp.json`:

```json
{
  "mcpServers": {
    "coinbase": {
      "url": "http://<server-ip>:3002/mcp"
    }
  }
}
```

Replace `<server-ip>` with your Docker host's IP (e.g. `192.168.1.100`).

---

## Connecting via stdio (Claude Desktop / local Docker)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coinbase": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "CDP_API_KEY_ID",
        "-e", "CDP_API_KEY_SECRET",
        "-e", "CDP_WALLET_SECRET",
        "-e", "NETWORK_ID",
        "-p", "3002:3002",
        "-v", "coinbase_wallet_data:/app/data",
        "ghcr.io/schmalvis/coinbase-mcp-server:latest"
      ],
      "env": {
        "CDP_API_KEY_ID": "your-key-id",
        "CDP_API_KEY_SECRET": "your-api-secret",
        "CDP_WALLET_SECRET": "your-wallet-secret",
        "NETWORK_ID": "base-sepolia"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: *"What Coinbase tools do you have available?"* to confirm.

---

## Quick Start (Docker Compose)

```bash
cp .env.example .env   # fill in your CDP credentials
docker compose up -d
```

Web UI available at **`http://localhost:3002`**.

---

## Multi-Network

Set `NETWORK_ID` to a comma-separated list to enable multiple networks:

```env
NETWORK_ID=base-sepolia,base-mainnet
```

Each tool gains a `network` parameter — the AI specifies which network per request.

---

## Web UI

When running, a monitoring dashboard is available at **`http://localhost:3002`** (or your server's IP for remote deployments). Shows all available tools and a live rolling activity log.

---

## Further Documentation

| Topic | Doc |
|-------|-----|
| CDP credentials and env vars | [docs/configuration.md](docs/configuration.md) |
| Running locally and development | [docs/development.md](docs/development.md) |
| Docker, Portainer, and GitOps deployment | [docs/deployment.md](docs/deployment.md) |
| Web UI and activity log | [docs/web-ui.md](docs/web-ui.md) |
| Wallet management and testnet vs mainnet | [docs/wallet.md](docs/wallet.md) |

---

*Built on [Coinbase AgentKit](https://github.com/coinbase/agentkit) · [Model Context Protocol](https://modelcontextprotocol.io)*
