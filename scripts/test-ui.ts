/**
 * Mock UI test — runs entirely without real Coinbase credentials.
 *
 * • Seeds the logger with realistic entries
 * • Starts the web server with 12 mock AgentKit tools
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

// ── Mock tools (mirrors real AgentKit tool shapes) ────────────────────────────

const MOCK_TOOLS = [
  {
    name: "get_wallet_details",
    description: "Retrieves the details of the connected MPC wallet including address and network.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_balance",
    description: "Gets the balance of a specific asset in the wallet.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Asset symbol, e.g. ETH, USDC" },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "request_faucet_funds",
    description: "Requests test tokens from the network faucet (testnet only).",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Asset to request, e.g. ETH" },
      },
      required: [],
    },
  },
  {
    name: "transfer",
    description: "Transfers an amount of a given asset to a destination address.",
    inputSchema: {
      type: "object",
      properties: {
        amount:           { type: "string",  description: "Amount to transfer" },
        asset_id:         { type: "string",  description: "Asset symbol or contract address" },
        destination:      { type: "string",  description: "Recipient address or ENS name" },
        gasless:          { type: "boolean", description: "Use gasless transfer if supported" },
      },
      required: ["amount", "asset_id", "destination"],
    },
  },
  {
    name: "trade",
    description: "Trades one asset for another using an on-chain DEX.",
    inputSchema: {
      type: "object",
      properties: {
        amount:         { type: "string", description: "Amount of from_asset_id to trade" },
        from_asset_id:  { type: "string", description: "Source asset" },
        to_asset_id:    { type: "string", description: "Target asset" },
      },
      required: ["amount", "from_asset_id", "to_asset_id"],
    },
  },
  {
    name: "deploy_token",
    description: "Deploys a new ERC-20 token contract.",
    inputSchema: {
      type: "object",
      properties: {
        name:             { type: "string", description: "Token name" },
        symbol:           { type: "string", description: "Token symbol" },
        total_supply:     { type: "string", description: "Total supply (in whole tokens)" },
      },
      required: ["name", "symbol", "total_supply"],
    },
  },
  {
    name: "deploy_nft",
    description: "Deploys an ERC-721 NFT collection contract.",
    inputSchema: {
      type: "object",
      properties: {
        name:      { type: "string", description: "Collection name" },
        symbol:    { type: "string", description: "Collection symbol" },
        base_uri:  { type: "string", description: "Metadata base URI" },
      },
      required: ["name", "symbol", "base_uri"],
    },
  },
  {
    name: "mint_nft",
    description: "Mints an NFT from an existing ERC-721 contract to a destination address.",
    inputSchema: {
      type: "object",
      properties: {
        contract_address: { type: "string", description: "NFT contract address" },
        destination:      { type: "string", description: "Recipient address" },
      },
      required: ["contract_address", "destination"],
    },
  },
  {
    name: "wrap_eth",
    description: "Wraps ETH into WETH (ERC-20) at a 1:1 ratio.",
    inputSchema: {
      type: "object",
      properties: {
        amount_to_wrap: { type: "string", description: "Amount of ETH to wrap" },
      },
      required: ["amount_to_wrap"],
    },
  },
  {
    name: "get_asset_price",
    description: "Fetches the current USD price of an on-chain asset.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Asset symbol, e.g. BTC, ETH, USDC" },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "register_basename",
    description: "Registers a Basename (Base-native ENS subdomain) for the wallet address.",
    inputSchema: {
      type: "object",
      properties: {
        basename: { type: "string", description: "Desired name, e.g. myname.base.eth" },
        amount:   { type: "string", description: "Registration fee in ETH" },
      },
      required: ["basename", "amount"],
    },
  },
  {
    name: "wow_create_token",
    description: "Creates a WOW protocol memecoin with a built-in bonding curve.",
    inputSchema: {
      type: "object",
      properties: {
        name:      { type: "string", description: "Token name" },
        symbol:    { type: "string", description: "Token ticker" },
        token_uri: { type: "string", description: "IPFS URI for token metadata/image" },
      },
      required: ["name", "symbol", "token_uri"],
    },
  },
];

// ── Seed the activity log ─────────────────────────────────────────────────────

function past(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const SEED_ENTRIES = [
  { ts: past(47), level: "info",  event: "boot",         message: "Resuming existing wallet from /app/data/wallet_data.json" },
  { ts: past(46), level: "info",  event: "boot",         message: "Loaded 12 AgentKit tool(s).", data: { toolCount: 12, network: "base-sepolia" } },
  { ts: past(46), level: "info",  event: "server_ready", message: "MCP server ready. 12 tool(s) available on base-sepolia.", data: { toolCount: 12, network: "base-sepolia" } },
  { ts: past(38), level: "info",  event: "tool_call",    message: "Tool called: get_wallet_details", data: { tool: "get_wallet_details", args: {} } },
  { ts: past(38), level: "info",  event: "tool_result",  message: "Tool succeeded: get_wallet_details (312ms)", data: { tool: "get_wallet_details", success: true, durationMs: 312 } },
  { ts: past(30), level: "info",  event: "tool_call",    message: "Tool called: get_balance", data: { tool: "get_balance", args: { asset_id: "ETH" } } },
  { ts: past(30), level: "info",  event: "tool_result",  message: "Tool succeeded: get_balance (289ms)", data: { tool: "get_balance", success: true, durationMs: 289 } },
  { ts: past(22), level: "info",  event: "tool_call",    message: "Tool called: request_faucet_funds", data: { tool: "request_faucet_funds", args: {} } },
  { ts: past(22), level: "info",  event: "tool_result",  message: "Tool succeeded: request_faucet_funds (4821ms)", data: { tool: "request_faucet_funds", success: true, durationMs: 4821 } },
  { ts: past(15), level: "info",  event: "tool_call",    message: "Tool called: transfer", data: { tool: "transfer", args: { amount: "0.001", asset_id: "ETH", destination: "0xAbc…" } } },
  { ts: past(15), level: "warn",  event: "tool_error",   message: "Tool failed: transfer (1203ms)", data: { tool: "transfer", success: false, durationMs: 1203 } },
  { ts: past(8),  level: "info",  event: "tool_call",    message: "Tool called: get_asset_price", data: { tool: "get_asset_price", args: { asset_id: "BTC" } } },
  { ts: past(8),  level: "info",  event: "tool_result",  message: "Tool succeeded: get_asset_price (198ms)", data: { tool: "get_asset_price", success: true, durationMs: 198 } },
  { ts: past(2),  level: "info",  event: "tool_call",    message: "Tool called: trade", data: { tool: "trade", args: { amount: "0.01", from_asset_id: "ETH", to_asset_id: "USDC" } } },
  { ts: past(2),  level: "info",  event: "tool_result",  message: "Tool succeeded: trade (3547ms)", data: { tool: "trade", success: true, durationMs: 3547 } },
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
  assert("GET /api/tools  →  12 tools", tools.length === MOCK_TOOLS.length, `got ${tools.length}`);
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
