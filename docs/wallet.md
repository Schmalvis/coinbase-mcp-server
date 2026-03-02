# Wallet Management

## What Kind of Wallet Is This?

The server uses a **non-custodial MPC wallet** provided by Coinbase CDP:

- **Non-custodial** — only you can move funds; Coinbase cannot
- **MPC (Multi-Party Computation)** — the private key is split across parties with no single point of failure
- The wallet is created automatically on first run and reloaded on every subsequent start from `wallet_data.json`

## Where Is the Wallet Stored?

| Runtime | Location |
|---------|----------|
| Node.js (local) | `./data/wallet_data.json` |
| Docker / Portainer | Named volume `wallet_data` → `/app/data/wallet_data.json` |

## Backing Up

> If you lose `wallet_data.json` you lose access to any funds in that wallet.

**Docker backup:**

```bash
docker run --rm \
  -v coinbase_wallet_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/wallet_data.json /backup/wallet_data_backup.json
```

Store the backup somewhere safe, separate from your API keys.

## ⚠️ Deleting the Volume

```bash
docker compose down      # safe — wallet volume is preserved
docker compose down -v   # DANGER — permanently deletes the wallet volume
```

Never run `down -v` if you have funds you want to keep.

## Testnet vs Mainnet

| | `base-sepolia` (default) | `base-mainnet` |
|---|---|---|
| Funds | Fake test tokens, zero value | Real cryptocurrency |
| Risk | None | Mistakes are usually irreversible |
| Getting funds | [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet) | Purchase on Coinbase |

Switch networks by changing `NETWORK_ID` in your env file. **Always start on testnet.**

## Corrupted Wallet File

If `wallet_data.json` is corrupted, the server logs a warning and creates a fresh wallet automatically. The old wallet address becomes inaccessible — move any funds out before this happens if possible.

## Multiple Wallets

Each running server instance manages one wallet. To use multiple wallets, run multiple instances with different data directories and separate environment configurations.
