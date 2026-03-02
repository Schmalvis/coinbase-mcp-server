# Wallet Management

## What Kind of Wallet Is This?

The server uses a **non-custodial MPC wallet** provided by Coinbase CDP:

- **Non-custodial** — only you can move funds; Coinbase cannot
- **MPC (Multi-Party Computation)** — the private key is split across parties with no single point of failure
- The wallet is created automatically on first run and reloaded on every subsequent start from `wallet_data.json`

> `wallet_data.json` is the single most important file this server produces. Losing it means losing access to any funds held in that wallet. Treat it like a password.

---

## Where Is the Wallet Stored?

Storage is controlled by `WALLET_DATA_PATH` in `stack.env`:

| `WALLET_DATA_PATH` | Mode | Host location |
|--------------------|------|---------------|
| unset (default) | Docker named volume | managed by Docker, not directly visible on host |
| `/opt/coinbase-mcp/data` (example) | Bind mount | `/opt/coinbase-mcp/data/wallet_data.json` |

### Recommended: use a bind mount

Setting an explicit host path makes the wallet file directly accessible and removes any ambiguity about where data lives:

```env
# stack.env
WALLET_DATA_PATH=/opt/coinbase-mcp/data
```

**Before first start**, create the directory and grant write access to UID 1000 (the `node` user inside the container):

```bash
mkdir -p /opt/coinbase-mcp/data
chown 1000:1000 /opt/coinbase-mcp/data
```

The wallet will be written to `/opt/coinbase-mcp/data/wallet_data.json` on the host immediately after first boot.

---

## Backing Up

**Bind mount** — copy directly from the host:

```bash
cp /opt/coinbase-mcp/data/wallet_data.json ~/wallet_data_backup.json
```

**Named volume** — export via a temporary Alpine container:

```bash
docker run --rm \
  -v coinbase_wallet_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/wallet_data.json /backup/wallet_data_backup.json
```

Store backups somewhere separate from your API keys — a different machine, an encrypted drive, or a password manager that supports file attachments.

---

## ⚠️ Deleting the Volume

```bash
docker compose down      # safe — wallet data is preserved in all cases
docker compose down -v   # DANGER — permanently deletes the named volume
                         # (has no effect on bind mounts)
```

Never run `down -v` if you have funds you want to keep.

---

## Testnet vs Mainnet

| | `base-sepolia` (default) | `base-mainnet` |
|---|---|---|
| Funds | Fake test tokens, zero value | Real cryptocurrency |
| Risk | None | Mistakes are usually irreversible |
| Getting funds | [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet) | Purchase on Coinbase |

Switch by changing `NETWORK_ID` in your env file. **Always start on testnet.**

---

## Corrupted Wallet File

If `wallet_data.json` is corrupted, the server logs a warning and creates a fresh wallet automatically. The old wallet address becomes inaccessible — move any funds out before this happens if possible.

---

## Multiple Wallets

Each server instance manages one wallet. To run multiple wallets, run multiple instances with different `WALLET_DATA_PATH` values and separate environment configurations.
