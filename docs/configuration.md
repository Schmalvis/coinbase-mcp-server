# Configuration

## Getting Coinbase API Keys

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) and sign in
2. Navigate to **API Keys** → **Create API Key**
3. Name it (e.g. `mcp-server`), grant wallet read/write permissions, click **Create and Download**

The downloaded JSON file looks like:

```json
{
  "id": "a1b2c3d4e5f6...",
  "privateKey": "MoYREDACTED...U="
}
```

> You can only download this file once. Store it safely and never commit it to Git — it is covered by `.gitignore` (`cdp_api_key*.json`).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CDP_API_KEY_NAME` | ✅ | — | The `id` field from your downloaded JSON key file |
| `CDP_API_KEY_PRIVATE_KEY` | ✅ | — | The `privateKey` field from your downloaded JSON key file (base64, paste as-is) |
| `MNEMONIC_PHRASE` | — | — | BIP39 seed phrase for deterministic wallet (recommended — see [wallet.md](wallet.md)) |
| `NETWORK_ID` | — | `base-sepolia` | `base-sepolia` for testnet, `base-mainnet` for real funds |
| `WEB_PORT` | — | `3002` | Port for the built-in monitoring web UI |
| `LOG_RETENTION_DAYS` | — | `30` | Days to retain activity log entries |
| `WALLET_DATA_PATH` | — | Docker named volume | Absolute host path for wallet data bind mount |
| `ACTIVITY_LOG_FILE` | — | `/app/data/activity.log` | Log file path (override for local dev/testing) |

---

## Keeping Secrets Out of Git

`stack.env` is committed to the repository with **placeholder values only** — never real credentials. There are two ways to supply the actual secrets:

### Option A: Portainer environment variables UI (recommended for server deployments)

In Portainer → your stack → Environment variables, add each secret variable. These take precedence over the values in `stack.env` and are stored securely in Portainer, never in git:

```
CDP_API_KEY_NAME       = a1b2c3d4e5f6...
CDP_API_KEY_PRIVATE_KEY = MoYREDACTED...U=
MNEMONIC_PHRASE        = word1 word2 word3 ...
WALLET_DATA_PATH       = /home/pi/shared/docker/coinbase/data
```

### Option B: `stack.env.local` (recommended for local development)

`stack.env.local` is gitignored. Copy `stack.env` to it and fill in real values:

```bash
cp stack.env stack.env.local
```

Then reference it when running Compose locally:

```bash
docker compose --env-file stack.env.local up -d
```

> Never put real credentials in `stack.env` itself — treat it as a public template.
