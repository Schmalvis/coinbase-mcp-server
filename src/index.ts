import {
  AgentKit,
  CdpEvmWalletProvider,
  basenameActionProvider,
  cdpApiActionProvider,
  cdpEvmWalletActionProvider,
  compoundActionProvider,
  defillamaActionProvider,
  ensoActionProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  morphoActionProvider,
  pythActionProvider,
  superfluidPoolActionProvider,
  superfluidQueryActionProvider,
  superfluidStreamActionProvider,
  superfluidSuperTokenCreatorActionProvider,
  superfluidWrapperActionProvider,
  walletActionProvider,
  wethActionProvider,
} from "@coinbase/agentkit";
import { getMcpTools } from "@coinbase/agentkit-model-context-protocol";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

// ── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 0. Trim log entries older than retention window
  trimOldLogs();

  // 1. Validate required environment variables
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  const networkId = process.env.NETWORK_ID ?? "base-sepolia";

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error(
      "Missing required environment variables: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET"
    );
  }

  // 2. Configure v2 wallet provider ─────────────────────────────────────────
  // The wallet is deterministically derived from CDP_WALLET_SECRET — no local
  // wallet file needed. The same secret always produces the same address.
  const bootMsg = `Configuring CdpEvmWalletProvider on ${networkId}`;
  console.error("[boot]", bootMsg);
  logBoot(bootMsg);

  const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId,
    apiKeySecret,
    walletSecret,
    networkId,
  });

  const address = await walletProvider.getAddress();
  const addrMsg = `Wallet address: ${address}`;
  console.error("[boot]", addrMsg);
  logBoot(addrMsg, { address, network: networkId });

  // 3. Initialise AgentKit ───────────────────────────────────────────────────
  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      walletActionProvider(),
      cdpApiActionProvider(),
      cdpEvmWalletActionProvider(),
      erc20ActionProvider(),
      erc721ActionProvider(),
      wethActionProvider(),
      basenameActionProvider(),
      compoundActionProvider(),
      ensoActionProvider(),
      morphoActionProvider(),
      superfluidStreamActionProvider(),
      superfluidPoolActionProvider(),
      superfluidQueryActionProvider(),
      superfluidWrapperActionProvider(),
      superfluidSuperTokenCreatorActionProvider(),
      defillamaActionProvider(),
      pythActionProvider(),
    ],
  });

  // 4. Obtain MCP tool definitions + unified handler from AgentKit ──────────
  const { tools, toolHandler } = await getMcpTools(agentKit);
  const toolsMsg = `Loaded ${tools.length} AgentKit tool(s).`;
  console.error("[boot]", toolsMsg);
  logBoot(toolsMsg, { toolCount: tools.length, network: networkId });

  // 5. Build MCP server ──────────────────────────────────────────────────────
  const server = new Server(
    { name: "coinbase-agentkit-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

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

  // 6. Connect stdio transport ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 7. Start web UI alongside stdio ─────────────────────────────────────────
  startWebServer(tools);

  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "server_ready",
    message: `MCP server ready. ${tools.length} tool(s) available on ${networkId}.`,
    data: { toolCount: tools.length, network: networkId, address },
  });

  console.error("[mcp] Server running on stdio – ready for connections.");
}

main().catch(async (err: unknown) => {
  console.error("[fatal]", err);
  logFatal("Unhandled startup error", err);
  process.exit(1);
});
