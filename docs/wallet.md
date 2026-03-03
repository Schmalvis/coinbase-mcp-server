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

## Mnemonic Phrase

Setting a **BIP39 mnemonic phrase** makes the wallet deterministic — the same phrase always produces the same wallet address, and `wallet_data.json` becomes a cache rather than the source of truth:

```env
# stack.env (or Portainer environment variables)
MNEMONIC_PHRASE=word1 word2 word3 ... word12
```

**Advantages:**
- Wallet is fully recoverable from the phrase alone — `wallet_data.json` loss is not catastrophic
- Deterministic: same phrase always produces the same wallet address on the same network

**Important limitation:**
The mnemonic is converted to a seed locally, but the wallet must still be **registered with Coinbase CDP** via `CreateWallet` on first run. This means:
- The `CreateWallet` API call still happens on first boot (same as without a mnemonic)
- If you are rate-limited on `CreateWallet`, a mnemonic does not help until the limit clears
- Once registered, subsequent starts load from `wallet_data.json` and no API call is needed

**Generating a mnemonic securely:**
1. Go to [iancoleman.io/bip39](https://iancoleman.io/bip39) in your browser
2. Go offline (disconnect from internet) before generating
3. Generate a 12 or 24-word phrase
4. Write it down on paper and store it securely — treat it like a hardware wallet seed phrase
5. Set it via Portainer's environment variables UI (not in the committed `stack.env`)

> Never store the mnemonic in the same place as your API keys or `wallet_data.json`.

---

## Corrupted Wallet File

If `wallet_data.json` is corrupted, the server logs a warning and creates a fresh wallet automatically. The old wallet address becomes inaccessible — move any funds out before this happens if possible.

If you set `MNEMONIC_PHRASE`, a corrupted or missing `wallet_data.json` is not a problem — the server will re-derive the same wallet from the phrase.

---

## Multiple Wallets

Each server instance manages one wallet. To run multiple wallets, run multiple instances with different `WALLET_DATA_PATH` values and separate environment configurations.
