/**
 * Mock UI test — runs entirely without real Coinbase credentials.
 *
 * • Seeds the logger with realistic entries
 * • Starts the web server with mock AgentKit tools (matching v2 provider names)
 * • Asserts all three API endpoints return correct data
 * • Keeps the server alive so you can open the UI in a browser
 *
 * Usage:  npm run test:ui
 * Then open:  http://localhost:3002
 */

import * as os from "os";
import * as fs from "fs";
import * as path from "path";

// ── Set env vars BEFORE importing modules that read them at init time ─────────

const TEST_LOG_FILE = path.join(os.tmpdir(), "coinbase-mcp-test-ui.log");
process.env.ACTIVITY_LOG_FILE = TEST_LOG_FILE;
process.env.WEB_PORT = process.env.WEB_PORT ?? "3002";
process.env.LOG_RETENTION_DAYS = "30";

// Clean up any leftover log from a previous run
if (fs.existsSync(TEST_LOG_FILE)) fs.unlinkSync(TEST_LOG_FILE);

// Dynamic imports so env vars are set before module initialisation
const { writeLog } = await import("../src/logger.js");
const { startWebServer } = await import("../src/webServer.js");

// ── Mock tools (mirrors real v2 AgentKit tool shapes) ─────────────────────────

const MOCK_TOOLS = [
  { name: "WalletActionProvider_get_wallet_details",           description: "Returns wallet address, network, chain ID, and native token balance.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "WalletActionProvider_native_transfer",              description: "Transfers native tokens (ETH) to another address.", inputSchema: { type: "object", properties: { to: { type: "string" }, value: { type: "string" } }, required: ["to", "value"] } },
  { name: "CdpApiActionProvider_request_faucet_funds",         description: "Requests test tokens from the faucet (testnet only).", inputSchema: { type: "object", properties: { assetId: { type: "string" } }, required: [] } },
  { name: "CdpEvmWalletActionProvider_get_swap_price",         description: "Gets a swap price quote between two tokens.", inputSchema: { type: "object", properties: { fromAsset: { type: "string" }, toAsset: { type: "string" }, amount: { type: "string" } }, required: ["fromAsset", "toAsset", "amount"] } },
  { name: "CdpEvmWalletActionProvider_swap",                   description: "Executes a token swap on-chain.", inputSchema: { type: "object", properties: { fromAsset: { type: "string" }, toAsset: { type: "string" }, amount: { type: "string" } }, required: ["fromAsset", "toAsset", "amount"] } },
  { name: "CdpEvmWalletActionProvider_list_spend_permissions", description: "Lists active spend permissions for the wallet.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "CdpEvmWalletActionProvider_use_spend_permission",   description: "Uses a spend permission to transfer tokens.", inputSchema: { type: "object", properties: { permissionId: { type: "string" }, amount: { type: "string" } }, required: ["permissionId", "amount"] } },
  { name: "ERC20ActionProvider_get_balance",                   description: "Gets the ERC-20 token balance for an address.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, address: { type: "string" } }, required: ["contractAddress"] } },
  { name: "ERC20ActionProvider_transfer",                      description: "Transfers ERC-20 tokens to another address.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, to: { type: "string" }, amount: { type: "string" } }, required: ["contractAddress", "to", "amount"] } },
  { name: "ERC20ActionProvider_approve",                       description: "Approves a spender to use ERC-20 tokens.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, spender: { type: "string" }, amount: { type: "string" } }, required: ["contractAddress", "spender", "amount"] } },
  { name: "ERC20ActionProvider_get_allowance",                 description: "Gets the ERC-20 allowance for an owner/spender pair.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, owner: { type: "string" }, spender: { type: "string" } }, required: ["contractAddress", "owner", "spender"] } },
  { name: "ERC20ActionProvider_get_erc20_token_address",       description: "Resolves a token symbol to its contract address.", inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "Erc721ActionProvider_mint",                         description: "Mints an NFT from an ERC-721 contract.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, to: { type: "string" } }, required: ["contractAddress", "to"] } },
  { name: "Erc721ActionProvider_transfer",                     description: "Transfers an ERC-721 NFT to another address.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, to: { type: "string" }, tokenId: { type: "string" } }, required: ["contractAddress", "to", "tokenId"] } },
  { name: "Erc721ActionProvider_get_balance",                  description: "Gets the NFT balance for an address.", inputSchema: { type: "object", properties: { contractAddress: { type: "string" }, address: { type: "string" } }, required: ["contractAddress"] } },
  { name: "WethActionProvider_wrap_eth",                       description: "Wraps ETH into WETH at a 1:1 ratio.", inputSchema: { type: "object", properties: { amount: { type: "string" } }, required: ["amount"] } },
  { name: "WethActionProvider_unwrap_eth",                     description: "Unwraps WETH back to ETH.", inputSchema: { type: "object", properties: { amount: { type: "string" } }, required: ["amount"] } },
  { name: "BasenameActionProvider_register_basename",          description: "Registers a Basename (Base ENS subdomain) for the wallet.", inputSchema: { type: "object", properties: { name: { type: "string" }, amount: { type: "string" } }, required: ["name", "amount"] } },
  { name: "CompoundActionProvider_supply",                     description: "Supplies an asset to Compound V3 to earn interest.", inputSchema: { type: "object", properties: { asset: { type: "string" }, amount: { type: "string" } }, required: ["asset", "amount"] } },
  { name: "CompoundActionProvider_withdraw",                   description: "Withdraws a supplied asset from Compound V3.", inputSchema: { type: "object", properties: { asset: { type: "string" }, amount: { type: "string" } }, required: ["asset", "amount"] } },
  { name: "CompoundActionProvider_borrow",                     description: "Borrows an asset from Compound V3.", inputSchema: { type: "object", properties: { asset: { type: "string" }, amount: { type: "string" } }, required: ["asset", "amount"] } },
  { name: "CompoundActionProvider_repay",                      description: "Repays a Compound V3 borrow position.", inputSchema: { type: "object", properties: { asset: { type: "string" }, amount: { type: "string" } }, required: ["asset", "amount"] } },
  { name: "CompoundActionProvider_get_portfolio",              description: "Gets the current Compound V3 portfolio summary.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "MorphoActionProvider_deposit",                      description: "Deposits assets into a Morpho vault.", inputSchema: { type: "object", properties: { vault: { type: "string" }, amount: { type: "string" } }, required: ["vault", "amount"] } },
  { name: "MorphoActionProvider_withdraw",                     description: "Withdraws assets from a Morpho vault.", inputSchema: { type: "object", properties: { vault: { type: "string" }, amount: { type: "string" } }, required: ["vault", "amount"] } },
  { name: "SuperfluidStreamActionProvider_create_stream",      description: "Creates a Superfluid token stream.", inputSchema: { type: "object", properties: { token: { type: "string" }, receiver: { type: "string" }, flowRate: { type: "string" } }, required: ["token", "receiver", "flowRate"] } },
  { name: "SuperfluidStreamActionProvider_update_stream",      description: "Updates the flow rate of an existing Superfluid stream.", inputSchema: { type: "object", properties: { token: { type: "string" }, receiver: { type: "string" }, flowRate: { type: "string" } }, required: ["token", "receiver", "flowRate"] } },
  { name: "SuperfluidStreamActionProvider_delete_stream",      description: "Deletes a Superfluid token stream.", inputSchema: { type: "object", properties: { token: { type: "string" }, receiver: { type: "string" } }, required: ["token", "receiver"] } },
  { name: "SuperfluidPoolActionProvider_create_pool",          description: "Creates a Superfluid distribution pool.", inputSchema: { type: "object", properties: { token: { type: "string" } }, required: ["token"] } },
  { name: "SuperfluidPoolActionProvider_update_pool",          description: "Updates a Superfluid distribution pool.", inputSchema: { type: "object", properties: { poolAddress: { type: "string" } }, required: ["poolAddress"] } },
  { name: "SuperfluidQueryActionProvider_query_streams",       description: "Queries active Superfluid streams.", inputSchema: { type: "object", properties: { account: { type: "string" } }, required: [] } },
  { name: "SuperfluidWrapperActionProvider_wrap_superfluid_token",       description: "Wraps a token into its Superfluid super token.", inputSchema: { type: "object", properties: { token: { type: "string" }, amount: { type: "string" } }, required: ["token", "amount"] } },
  { name: "SuperfluidSuperTokenCreatorActionProvider_create_super_token", description: "Creates a new Superfluid super token.", inputSchema: { type: "object", properties: { name: { type: "string" }, symbol: { type: "string" } }, required: ["name", "symbol"] } },
  { name: "DefiLlamaActionProvider_find_protocol",             description: "Searches DeFi Llama for protocols by name.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "DefiLlamaActionProvider_get_protocol",              description: "Gets detailed info about a DeFi protocol.", inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
  { name: "DefiLlamaActionProvider_get_token_prices",          description: "Gets current prices for tokens from DeFi Llama.", inputSchema: { type: "object", properties: { tokens: { type: "array", items: { type: "string" } } }, required: ["tokens"] } },
  { name: "PythActionProvider_fetch_price_feed",               description: "Fetches a Pyth price feed ID for an asset.", inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "PythActionProvider_fetch_price",                    description: "Fetches the current price of an asset from Pyth.", inputSchema: { type: "object", properties: { feedId: { type: "string" } }, required: ["feedId"] } },
];

// ── Seed the activity log ─────────────────────────────────────────────────────

function past(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const SEED_ENTRIES = [
  { ts: past(47), level: "info",  event: "boot",         message: "Configuring CdpEvmWalletProvider on base-sepolia" },
  { ts: past(47), level: "info",  event: "boot",         message: "Wallet address: 0x510D2b204A4496D34fee7EFbF563dACE3C441b7f", data: { address: "0x510D2b204A4496D34fee7EFbF563dACE3C441b7f", network: "base-sepolia" } },
  { ts: past(46), level: "info",  event: "boot",         message: `Loaded ${MOCK_TOOLS.length} AgentKit tool(s).`, data: { toolCount: MOCK_TOOLS.length, network: "base-sepolia" } },
  { ts: past(46), level: "info",  event: "server_ready", message: `MCP server ready. ${MOCK_TOOLS.length} tool(s) available on base-sepolia.`, data: { toolCount: MOCK_TOOLS.length, network: "base-sepolia" } },
  { ts: past(38), level: "info",  event: "tool_call",    message: "Tool called: WalletActionProvider_get_wallet_details", data: { tool: "WalletActionProvider_get_wallet_details", args: {} } },
  { ts: past(38), level: "info",  event: "tool_result",  message: "Tool succeeded: WalletActionProvider_get_wallet_details (312ms)", data: { tool: "WalletActionProvider_get_wallet_details", success: true, durationMs: 312 } },
  { ts: past(30), level: "info",  event: "tool_call",    message: "Tool called: ERC20ActionProvider_get_balance", data: { tool: "ERC20ActionProvider_get_balance", args: { contractAddress: "0xabc…", } } },
  { ts: past(30), level: "info",  event: "tool_result",  message: "Tool succeeded: ERC20ActionProvider_get_balance (289ms)", data: { tool: "ERC20ActionProvider_get_balance", success: true, durationMs: 289 } },
  { ts: past(22), level: "info",  event: "tool_call",    message: "Tool called: CdpApiActionProvider_request_faucet_funds", data: { tool: "CdpApiActionProvider_request_faucet_funds", args: {} } },
  { ts: past(22), level: "info",  event: "tool_result",  message: "Tool succeeded: CdpApiActionProvider_request_faucet_funds (4821ms)", data: { tool: "CdpApiActionProvider_request_faucet_funds", success: true, durationMs: 4821 } },
  { ts: past(15), level: "info",  event: "tool_call",    message: "Tool called: WalletActionProvider_native_transfer", data: { tool: "WalletActionProvider_native_transfer", args: { to: "0xAbc…", value: "0.001" } } },
  { ts: past(15), level: "warn",  event: "tool_error",   message: "Tool failed: WalletActionProvider_native_transfer (1203ms)", data: { tool: "WalletActionProvider_native_transfer", success: false, durationMs: 1203 } },
  { ts: past(8),  level: "info",  event: "tool_call",    message: "Tool called: PythActionProvider_fetch_price", data: { tool: "PythActionProvider_fetch_price", args: { feedId: "BTC/USD" } } },
  { ts: past(8),  level: "info",  event: "tool_result",  message: "Tool succeeded: PythActionProvider_fetch_price (198ms)", data: { tool: "PythActionProvider_fetch_price", success: true, durationMs: 198 } },
  { ts: past(2),  level: "info",  event: "tool_call",    message: "Tool called: CdpEvmWalletActionProvider_swap", data: { tool: "CdpEvmWalletActionProvider_swap", args: { fromAsset: "ETH", toAsset: "USDC", amount: "0.01" } } },
  { ts: past(2),  level: "info",  event: "tool_result",  message: "Tool succeeded: CdpEvmWalletActionProvider_swap (3547ms)", data: { tool: "CdpEvmWalletActionProvider_swap", success: true, durationMs: 3547 } },
] as const;

for (const entry of SEED_ENTRIES) {
  writeLog(entry as Parameters<typeof writeLog>[0]);
}

console.log(`\n✓ Seeded ${SEED_ENTRIES.length} log entries → ${TEST_LOG_FILE}`);

// ── Start the web server ──────────────────────────────────────────────────────

startWebServer(MOCK_TOOLS as never);

const port = process.env.WEB_PORT;
console.log(`✓ Web server starting on port ${port}…\n`);

// Give the server a moment to bind
await new Promise((r) => setTimeout(r, 300));

// ── Run API assertions ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

console.log("── API assertions ─────────────────────────────────────────────");

try {
  // GET /
  const htmlRes = await fetch(`http://localhost:${port}/`);
  assert("GET /  →  200",          htmlRes.status === 200);
  const html = await htmlRes.text();
  assert("GET /  →  contains title",   html.includes("AgentKit MCP"));
  assert("GET /  →  contains /api/tools script", html.includes("/api/tools"));
  assert("GET /  →  contains /api/logs script",  html.includes("/api/logs"));

  // GET /api/tools
  const toolsRes = await fetch(`http://localhost:${port}/api/tools`);
  assert("GET /api/tools  →  200",     toolsRes.status === 200);
  assert("GET /api/tools  →  JSON",    toolsRes.headers.get("content-type")?.includes("application/json") ?? false);
  const tools = await toolsRes.json() as Array<{ name: string; description: string; inputSchema: unknown }>;
  assert(`GET /api/tools  →  ${MOCK_TOOLS.length} tools`, tools.length === MOCK_TOOLS.length, `got ${tools.length}`);
  assert("GET /api/tools  →  tools have name",        tools.every(t => typeof t.name === "string" && t.name.length > 0));
  assert("GET /api/tools  →  tools have description", tools.every(t => typeof t.description === "string"));
  assert("GET /api/tools  →  tools have inputSchema",  tools.every(t => t.inputSchema !== undefined));

  // GET /api/logs
  const logsRes = await fetch(`http://localhost:${port}/api/logs`);
  assert("GET /api/logs  →  200",    logsRes.status === 200);
  assert("GET /api/logs  →  JSON",   logsRes.headers.get("content-type")?.includes("application/json") ?? false);
  const logs = await logsRes.json() as Array<{ ts: string; event: string; message: string }>;
  assert("GET /api/logs  →  entries present",          logs.length > 0,                          `got ${logs.length}`);
  assert("GET /api/logs  →  returned most-recent first", logs[0].ts >= logs[logs.length - 1].ts);
  assert("GET /api/logs  →  entries have ts/event/message", logs.every(e => e.ts && e.event && e.message));
  assert("GET /api/logs  →  contains tool_call event",  logs.some(e => e.event === "tool_call"));
  assert("GET /api/logs  →  contains server_ready event", logs.some(e => e.event === "server_ready"));

  // GET /api/logs?limit
  const limitRes = await fetch(`http://localhost:${port}/api/logs?limit=3`);
  const limited = await limitRes.json() as unknown[];
  assert("GET /api/logs?limit=3  →  honours limit", limited.length <= 3);

  // 404 handling
  const notFound = await fetch(`http://localhost:${port}/does-not-exist`);
  assert("GET /does-not-exist  →  404", notFound.status === 404);

} catch (err) {
  console.error("\n[test] Unexpected error during assertions:", err);
  process.exit(1);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("");
console.log(`── Results  ${passed} passed · ${failed} failed ${"─".repeat(30)}`);
console.log("");

if (failed > 0) {
  console.error("Some assertions failed. Server is still running for manual inspection.\n");
} else {
  console.log("All assertions passed.\n");
}

console.log(`🌐  Open in browser:  http://localhost:${port}`);
console.log("    Press Ctrl+C to stop.\n");

// Keep the process alive for manual UI inspection
process.on("SIGINT", () => {
  if (fs.existsSync(TEST_LOG_FILE)) fs.unlinkSync(TEST_LOG_FILE);
  console.log("\nTest log cleaned up. Bye.");
  process.exit(0);
});
