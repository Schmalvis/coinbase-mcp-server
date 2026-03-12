# Configuration

## Getting Coinbase CDP Credentials

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) and sign in
2. Navigate to **API Keys** → **Create API Key**
3. Copy the **Key ID** and **API Secret** shown after creation
4. Navigate to **Wallets** → create or open a wallet → copy the **Wallet Secret**

> These three values (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) are all that's needed. The wallet is deterministic — the same secret always produces the same address. Store them securely and never commit them to Git.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CDP_API_KEY_ID` | ✅ | — | CDP v2 API key ID |
| `CDP_API_KEY_SECRET` | ✅ | — | CDP v2 API key secret |
| `CDP_WALLET_SECRET` | ✅ | — | Wallet secret — deterministically derives the wallet address |
| `NETWORK_ID` | — | `base-sepolia` | Single network or comma-separated list e.g. `base-sepolia,base-mainnet` |
| `WEB_PORT` | — | `3002` | Port for the monitoring web UI |
| `LOG_RETENTION_DAYS` | — | `30` | Days to retain activity log entries |
| `WALLET_DATA_PATH` | — | Docker named volume | Absolute host path for log data bind mount |

---

## Multi-Network

Set `NETWORK_ID` to a comma-separated list to enable multiple networks simultaneously:

```env
NETWORK_ID=base-sepolia,base-mainnet
```

In multi-network mode, each tool gains a `network` enum parameter. The AI specifies which network to target per request; the default is the first network in the list.

---

## Local Development

Copy `.env.example` to `.env` and fill in real credentials:

```bash
cp .env.example .env
```

`.env` is gitignored — never commit real credentials.

---

## Portainer / Server Deployments

Set credentials as environment variables in the Portainer stack UI — they take precedence over `docker-compose.yml` defaults and are never stored in git:

```
CDP_API_KEY_ID       = your-key-id
CDP_API_KEY_SECRET   = your-api-secret
CDP_WALLET_SECRET    = your-wallet-secret
WALLET_DATA_PATH     = /opt/coinbase-mcp/data
```

> `docker-compose.yml` is committed with empty credential placeholders — treat it as a public template.
