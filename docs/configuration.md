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
| `NETWORK_ID` | — | `base-sepolia` | `base-sepolia` for testnet, `base-mainnet` for real funds |
| `WEB_PORT` | — | `3002` | Port for the built-in monitoring web UI |
| `LOG_RETENTION_DAYS` | — | `30` | Days to retain activity log entries |
| `ACTIVITY_LOG_FILE` | — | `/app/data/activity.log` | Log file path (override for local dev/testing) |

---

## Local Development — `.env`

Copy the example and fill in your values:

```bash
cp .env.example .env        # Mac/Linux
Copy-Item .env.example .env # Windows PowerShell
```

```env
CDP_API_KEY_NAME=a1b2c3d4e5f6...
CDP_API_KEY_PRIVATE_KEY=MoYREDACTED...U=

NETWORK_ID=base-sepolia
WEB_PORT=3002
LOG_RETENTION_DAYS=30
```

No PEM headers. No `\n` escaping. Paste the values from the JSON file exactly as-is.

---

## Portainer / Docker Compose — `stack.env`

`stack.env` is committed to the repository with placeholder values. Fill in your real values directly in the file, or override them in Portainer's environment variable UI (preferred, keeps secrets out of git):

```env
CDP_API_KEY_NAME=a1b2c3d4e5f6...
CDP_API_KEY_PRIVATE_KEY=MoYREDACTED...U=

NETWORK_ID=base-sepolia
WEB_PORT=3002
LOG_RETENTION_DAYS=30
```
