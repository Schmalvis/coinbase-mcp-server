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
    console.error("[boot] wallet_data.json is corrupted – ignoring it and creating a fresh wallet.");
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
    console.error(`[boot] Resuming existing wallet from ${WALLET_DATA_FILE}`);
  } else {
    console.error("[boot] No wallet file found – a fresh MPC wallet will be created.");
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
  console.error(`[boot] Loaded ${tools.length} AgentKit tool(s).`);

  // 6. Build MCP server ──────────────────────────────────────────────────────
  const server = new Server(
    { name: "coinbase-agentkit-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  // Execute a tool call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return toolHandler(name, (args ?? {}) as Record<string, unknown>);
  });

  // 7. Connect stdio transport ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[mcp] Server running on stdio – ready for connections.");
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exit(1);
});
