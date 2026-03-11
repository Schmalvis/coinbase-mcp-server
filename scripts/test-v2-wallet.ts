/**
 * test-v2-wallet.ts
 *
 * Standalone test for CDP v2 wallet provider (CdpV2WalletProvider).
 * Verifies that v2 credentials work and AgentKit initialises correctly.
 * Does NOT affect the main MCP server or wallet_data.json.
 *
 * Prerequisites — add to your .env (or export):
 *   CDP_API_KEY_ID      – from portal.cdp.coinbase.com → API Keys (v2)
 *   CDP_API_KEY_SECRET  – API key secret
 *   CDP_WALLET_SECRET   – wallet secret (separate from API key)
 *
 * Usage:
 *   npm run test:v2
 *   npx tsx scripts/test-v2-wallet.ts
 */

import { AgentKit, CdpEvmWalletProvider } from "@coinbase/agentkit";
import "dotenv/config";

async function main() {
  // ── 1. Validate credentials ────────────────────────────────────────────────

  const { CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET } = process.env;
  const networkId = process.env.NETWORK_ID ?? "base-sepolia";

  if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET || !CDP_WALLET_SECRET) {
    console.error(
      "Missing required environment variables.\n" +
      "Set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET in your .env file.\n" +
      "Obtain v2 credentials from https://portal.cdp.coinbase.com → API Keys (v2)."
    );
    process.exit(1);
  }

  console.log(`Network  : ${networkId}`);
  console.log(`Key ID   : ${CDP_API_KEY_ID}`);
  console.log();

  // ── 2. Configure v2 wallet provider ───────────────────────────────────────

  console.log("Configuring CdpV2WalletProvider...");
  const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
    walletSecret: CDP_WALLET_SECRET,
    networkId,
  });

  const address = await walletProvider.getAddress();
  const network = await walletProvider.getNetwork();

  console.log("  Address :", address);
  console.log("  Network :", network.networkId ?? networkId);
  console.log();

  // ── 3. Initialise AgentKit ────────────────────────────────────────────────

  console.log("Initialising AgentKit...");
  const agentkit = await AgentKit.from({ walletProvider });
  const actions = agentkit.getActions();
  console.log(`  Tools available : ${actions.length}`);
  console.log(`  Tool names      : ${actions.map((a) => a.name).join(", ")}`);
  console.log();

  console.log("v2 test passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
