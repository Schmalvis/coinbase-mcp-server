import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { getMcpTools } from "@coinbase/agentkit-model-context-protocol";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";
import {
  logBoot,
  logFatal,
  logToolCall,
  logToolResult,
  trimOldLogs,
  writeLog,
} from "./logger.js";
import { startWebServer } from "./webServer.js";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical path inside the container.
 * Mount a named Docker volume here so the file survives restarts/recreation.
 */
const WALLET_DATA_FILE = "/app/data/wallet_data.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadWalletData(): string | undefined {
  if (!fs.existsSync(WALLET_DATA_FILE)) return undefined;

  const raw = fs.readFileSync(WALLET_DATA_FILE, "utf-8").trim();
  if (!raw) return undefined;

  // Quick sanity-check – must be valid JSON
  try {
    JSON.parse(raw);
  } catch {
    const msg = "wallet_data.json is corrupted – ignoring it and creating a fresh wallet.";
    console.error("[boot]", msg);
    logBoot(msg);
    return undefined;
  }

  return raw;
}

function persistWalletData(data: unknown): void {
  const dir = path.dirname(WALLET_DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.error(`[boot] Wallet data persisted → ${WALLET_DATA_FILE}`);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 0. Trim log entries older than retention window
  trimOldLogs();

  // 1. Validate required environment variables
  const apiKeyName = process.env.CDP_API_KEY_NAME;
  const apiKeyPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;
  const networkId = process.env.NETWORK_ID ?? "base-sepolia";

  if (!apiKeyName || !apiKeyPrivateKey) {
    throw new Error(
      "Missing required environment variables: CDP_API_KEY_NAME, CDP_API_KEY_PRIVATE_KEY"
    );
  }

  // 2. Load-or-create wallet ─────────────────────────────────────────────────
  const cdpWalletData = loadWalletData();

  if (cdpWalletData) {
    const msg = `Resuming existing wallet from ${WALLET_DATA_FILE}`;
    console.error("[boot]", msg);
    logBoot(msg);
  } else {
    const msg = "No wallet file found – a fresh MPC wallet will be created.";
    console.error("[boot]", msg);
    logBoot(msg);
  }

  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName,
    apiKeyPrivateKey,
    networkId,
    ...(cdpWalletData ? { cdpWalletData } : {}),
  });

  // 3. Persist immediately (also covers the first-run case) ─────────────────
  const exported = await walletProvider.exportWallet();
  persistWalletData(exported);

  // 4. Initialise AgentKit ───────────────────────────────────────────────────
  const agentKit = await AgentKit.from({ walletProvider });

  // 5. Obtain MCP tool definitions + unified handler from AgentKit ──────────
  const { tools, toolHandler } = await getMcpTools(agentKit);
  const toolsMsg = `Loaded ${tools.length} AgentKit tool(s).`;
  console.error("[boot]", toolsMsg);
  logBoot(toolsMsg, { toolCount: tools.length, network: networkId });

  // 6. Build MCP server ──────────────────────────────────────────────────────
  const server = new Server(
    { name: "coinbase-agentkit-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  // Execute a tool call — wrapped to capture timing and log result
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    logToolCall(name, safeArgs);
    const start = Date.now();
    try {
      const result = await toolHandler(name, safeArgs);
      logToolResult(name, true, Date.now() - start);
      return result;
    } catch (err: unknown) {
      logToolResult(name, false, Date.now() - start);
      throw err; // let MCP SDK format the error response
    }
  });

  // 7. Connect stdio transport ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 8. Start web UI alongside stdio ─────────────────────────────────────────
  startWebServer(tools);

  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "server_ready",
    message: `MCP server ready. ${tools.length} tool(s) available on ${networkId}.`,
    data: { toolCount: tools.length, network: networkId },
  });

  console.error("[mcp] Server running on stdio – ready for connections.");
}

main().catch(async (err: unknown) => {
  console.error("[fatal]", err);
  logFatal("Unhandled startup error", err);

  // If the CDP API is rate-limiting wallet creation (429), pause before exiting
  // so Docker's restart policy doesn't immediately hammer the API again.
  const msg = String(err);
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("resource_exhausted")) {
    const wait = 600;
    console.error(`[fatal] Rate limit detected – waiting ${wait}s (10 min) before exit to allow rate limit window to clear.`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }

  process.exit(1);
});
