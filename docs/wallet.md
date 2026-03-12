# Wallet Management

## How the Wallet Works (CDP v2)

The server uses a **deterministic CDP wallet** derived from `CDP_WALLET_SECRET`:

- The same secret always produces the same wallet address — no local wallet file needed
- Non-custodial — only you can move funds; Coinbase cannot
- On each boot, the wallet address is logged to stderr and the activity log

> **Backup strategy:** securely store your three CDP credentials (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`). As long as you have `CDP_WALLET_SECRET`, you can always recover access to the wallet.

---

## Data Volume

The Docker volume (`/app/data`) stores the **activity log only** — not wallet state. Losing the volume means losing log history, not wallet access.

| `WALLET_DATA_PATH` | Mode | Host location |
|--------------------|------|---------------|
| unset (default) | Docker named volume | managed by Docker |
| `/opt/coinbase-mcp/data` (example) | Bind mount | directly accessible on host |

### Using a bind mount (recommended)

```env
# .env or docker-compose environment
WALLET_DATA_PATH=/opt/coinbase-mcp/data
```

Create the directory and grant write access to UID 1000 (the `node` user in the container):

```bash
mkdir -p /opt/coinbase-mcp/data
chown 1000:1000 /opt/coinbase-mcp/data
```

---

## Volume Safety

```bash
docker compose down      # safe — log data is preserved
docker compose down -v   # ⚠️ deletes the named log volume — irreversible
                         # (has no effect on bind mounts)
```

---

## Testnet vs Mainnet

| | `base-sepolia` (default) | `base-mainnet` |
|---|---|---|
| Funds | Fake test tokens, zero value | Real cryptocurrency |
| Risk | None | Mistakes are usually irreversible |
| Getting funds | `request_faucet_funds` tool or [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet) | Purchase on Coinbase |

Switch by changing `NETWORK_ID` in your env file. **Always start on testnet.**

To use both networks simultaneously, set `NETWORK_ID=base-sepolia,base-mainnet` — the AI will specify the target network per request. See [configuration.md](configuration.md).

---

## Multiple Wallets

Each server instance manages one wallet (derived from one `CDP_WALLET_SECRET`). To run multiple wallets, run multiple instances with separate environment configurations.
