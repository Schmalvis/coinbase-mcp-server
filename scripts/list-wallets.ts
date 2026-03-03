/**
 * list-wallets.ts
 *
 * Read-only utility: lists all wallets registered in this CDP project using
 * the credentials from cdp_api_key-test.json (or a path passed as argv[2]).
 *
 * Usage:
 *   npx tsx scripts/list-wallets.ts
 *   npx tsx scripts/list-wallets.ts ./path/to/cdp_api_key.json
 *
 * This script only calls GET /wallets — it never calls CreateWallet.
 * Safe to run even when the project is rate-limited on wallet creation.
 */

import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import * as fs from "fs";
import * as path from "path";

// ── Resolve credentials file ──────────────────────────────────────────────────

const keyFile = process.argv[2] ?? path.join(process.cwd(), "cdp_api_key-test.json");

if (!fs.existsSync(keyFile)) {
  console.error(`Key file not found: ${keyFile}`);
  process.exit(1);
}

const keyJson = JSON.parse(fs.readFileSync(keyFile, "utf-8"));

if (!keyJson.id || !keyJson.privateKey) {
  console.error("Key file must contain 'id' and 'privateKey' fields.");
  process.exit(1);
}

// ── Configure SDK ─────────────────────────────────────────────────────────────

Coinbase.configure({
  apiKeyName: keyJson.id,
  privateKey: keyJson.privateKey,
});

// ── List wallets ──────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching wallets for project...\n");

  const allWallets: Wallet[] = [];
  let page: string | undefined;

  do {
    const response = await Wallet.listWallets({ limit: 100, ...(page ? { page } : {}) });
    allWallets.push(...response.data);
    page = response.hasMore ? response.nextPage : undefined;
  } while (page);

  if (allWallets.length === 0) {
    console.log("No wallets found in this project.");
    return;
  }

  console.log(`Found ${allWallets.length} wallet(s):\n`);

  for (const wallet of allWallets) {
    const walletId = wallet.getId();
    const networkId = wallet.getNetworkId();

    // Fetch addresses (read-only, no signing required)
    let defaultAddress = "(unavailable)";
    try {
      const addr = await wallet.getDefaultAddress();
      if (addr) defaultAddress = addr.getId();
    } catch {
      // some wallets may have no address if creation was incomplete
    }

    console.log(`  Wallet ID : ${walletId}`);
    console.log(`  Network   : ${networkId}`);
    console.log(`  Address   : ${defaultAddress}`);
    console.log();
  }

  // ── Attempt to export any wallet that has a seed (usable wallets) ──────────
  console.log("─".repeat(60));
  console.log("Checking which wallets can be exported (have local seed)...\n");

  let exportable = 0;
  for (const wallet of allWallets) {
    try {
      const exported = await wallet.export();
      console.log(`  ✓ Wallet ${wallet.getId()} is exportable.`);
      console.log(`    Save this as wallet_data.json to restore the server:\n`);
      console.log(JSON.stringify(exported, null, 2));
      console.log();
      exportable++;
    } catch {
      // Wallets fetched via listWallets don't have a seed — expected
    }
  }

  if (exportable === 0) {
    console.log(
      "  No wallets are exportable from this session.\n" +
      "  (Wallets listed via the API don't carry their seed — only wallets\n" +
      "   created in the same process session can be exported.)\n" +
      "\n" +
      "  If you have a mnemonic phrase, the wallet can be reconstructed\n" +
      "  once the CreateWallet rate limit has been lifted by CDP support."
    );
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
