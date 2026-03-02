# Coinbase AgentKit MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants direct access to your Coinbase wallet — check balances, transfer funds, deploy tokens, trade assets, and interact with the Base blockchain, all through natural language.

```
You → Claude / VS Code → This MCP Server → Coinbase AgentKit → Base Blockchain
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_wallet_details` | Wallet address and network info |
| `get_balance` | Balance of any asset (ETH, USDC, …) |
| `request_faucet_funds` | Free test tokens from the faucet (testnet only) |
| `transfer` | Send an asset to any address |
| `trade` | Swap one asset for another via DEX |
| `deploy_token` | Deploy an ERC-20 token contract |
| `deploy_nft` | Deploy an ERC-721 NFT collection |
| `mint_nft` | Mint an NFT to an address |
| `wrap_eth` | Wrap ETH → WETH |
| `get_asset_price` | Current USD price of any on-chain asset |
| `register_basename` | Register a Base ENS name (`.base.eth`) |
| `wow_create_token` | Launch a WOW bonding-curve memecoin |

---

## Connecting to Claude Desktop

Add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coinbase": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "CDP_API_KEY_NAME",
        "-e", "CDP_API_KEY_PRIVATE_KEY",
        "-e", "NETWORK_ID",
        "-v", "coinbase_wallet_data:/app/data",
        "ghcr.io/schmalvis/coinbase-mcp-server:latest"
      ],
      "env": {
        "CDP_API_KEY_NAME": "your-key-id",
        "CDP_API_KEY_PRIVATE_KEY": "your-base64-private-key",
        "NETWORK_ID": "base-sepolia"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: *"What Coinbase tools do you have available?"* to confirm.

---

## Connecting to VS Code

Add to `.vscode/mcp.json` in your workspace (or user `settings.json` under `"mcp.servers"`):

```json
{
  "servers": {
    "coinbase": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "CDP_API_KEY_NAME",
        "-e", "CDP_API_KEY_PRIVATE_KEY",
        "-e", "NETWORK_ID",
        "-v", "coinbase_wallet_data:/app/data",
        "ghcr.io/schmalvis/coinbase-mcp-server:latest"
      ],
      "env": {
        "CDP_API_KEY_NAME": "your-key-id",
        "CDP_API_KEY_PRIVATE_KEY": "your-base64-private-key",
        "NETWORK_ID": "base-sepolia"
      }
    }
  }
}
```

---

## Web UI

When running, a monitoring dashboard is available at **`http://localhost:3002`** (or your server's IP when deployed remotely). It shows all available tools and a live rolling activity log.

---

## Further Documentation

| Topic | Doc |
|-------|-----|
| Getting Coinbase API keys and configuring env vars | [docs/configuration.md](docs/configuration.md) |
| Running locally and development workflow | [docs/development.md](docs/development.md) |
| Docker, Portainer, and GitOps deployment | [docs/deployment.md](docs/deployment.md) |
| Web UI and activity log | [docs/web-ui.md](docs/web-ui.md) |
| Wallet management, backup, testnet vs mainnet | [docs/wallet.md](docs/wallet.md) |

---

*Built on [Coinbase AgentKit](https://github.com/coinbase/agentkit) · [Model Context Protocol](https://modelcontextprotocol.io)*
