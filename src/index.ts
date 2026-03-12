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
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type RawToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

// ── Action provider factory ───────────────────────────────────────────────────

function buildActionProviders() {
  return [
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
  ];
}

// ── Per-network initialisation ────────────────────────────────────────────────

async function initNetwork(
  networkId: string,
  apiKeyId: string,
  apiKeySecret: string,
  walletSecret: string,
): Promise<{ tools: Tool[]; toolHandler: RawToolHandler; address: string }> {
  const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId,
    apiKeySecret,
    walletSecret,
    networkId,
  });

  const address = await walletProvider.getAddress();

  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: buildActionProviders(),
  });

  const { tools, toolHandler } = await getMcpTools(agentKit);
  return { tools, toolHandler, address };
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 0. Trim log entries older than retention window
  trimOldLogs();

  // 1. Validate required environment variables
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error(
      "Missing required environment variables: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET"
    );
  }

  // NETWORK_ID accepts a comma-separated list, e.g. "base-sepolia,base-mainnet"
  const networks = (process.env.NETWORK_ID ?? "base-sepolia")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  // 2. Initialise each network ───────────────────────────────────────────────
  // toolRegistry: toolName → { schema, handlers: Map<networkId, handler> }
  interface NetworkedTool {
    schema: Tool;
    handlers: Map<string, RawToolHandler>;
  }
  const toolRegistry = new Map<string, NetworkedTool>();

  for (const networkId of networks) {
    const bootMsg = `Configuring CdpEvmWalletProvider on ${networkId}`;
    console.error("[boot]", bootMsg);
    logBoot(bootMsg);

    const { tools, toolHandler, address } = await initNetwork(
      networkId, apiKeyId, apiKeySecret, walletSecret,
    );

    logBoot(`Wallet address (${networkId}): ${address}`, { address, network: networkId });
    console.error(`[boot] Wallet address (${networkId}): ${address}`);

    for (const tool of tools) {
      if (!toolRegistry.has(tool.name)) {
        toolRegistry.set(tool.name, { schema: tool, handlers: new Map() });
      }
      const originalName = tool.name;
      toolRegistry.get(tool.name)!.handlers.set(
        networkId,
        (_, args) => toolHandler(originalName, args),
      );
    }

    logBoot(`Loaded ${tools.length} tool(s) for ${networkId}.`, {
      toolCount: tools.length, network: networkId,
    });
  }

  // 3. Build final tool list — inject `network` param when multiple networks ──
  const multiNetwork = networks.length > 1;
  const allTools: Tool[] = [];

  for (const [, entry] of toolRegistry) {
    if (!multiNetwork) {
      allTools.push(entry.schema);
    } else {
      const supportedNetworks = [...entry.handlers.keys()];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProps = (entry.schema.inputSchema as any).properties ?? {};
      allTools.push({
        ...entry.schema,
        inputSchema: {
          ...entry.schema.inputSchema,
          properties: {
            network: {
              type: "string",
              enum: supportedNetworks,
              default: supportedNetworks[0],
              description: `Blockchain network to execute on. Available: ${supportedNetworks.join(", ")}`,
            },
            ...existingProps,
          },
        },
      });
    }
  }

  console.error(`[boot] ${allTools.length} unique tool(s) across ${networks.length} network(s).`);

  // 4. Wrap with routing + logging ───────────────────────────────────────────
  const loggingToolHandler = async (name: string, args: Record<string, unknown>) => {
    const entry = toolRegistry.get(name);
    if (!entry) throw new Error(`Unknown tool: ${name}`);

    // Extract and strip the `network` param (only present in multi-network mode)
    let networkId = networks[0];
    let toolArgs = args;
    if (multiNetwork) {
      const { network, ...rest } = args;
      networkId = (typeof network === "string" && network) ? network : networks[0];
      toolArgs = rest;
    }

    const handler = entry.handlers.get(networkId);
    if (!handler) {
      throw new Error(`Tool "${name}" is not available on ${networkId}`);
    }

    logToolCall(name, { ...toolArgs, network: networkId });
    const start = Date.now();
    try {
      const result = await handler(name, toolArgs);
      logToolResult(name, true, Date.now() - start);
      return result;
    } catch (err: unknown) {
      logToolResult(name, false, Date.now() - start);
      throw err;
    }
  };

  // 4. Build stdio MCP server ────────────────────────────────────────────────
  const server = new Server(
    { name: "coinbase-agentkit-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return loggingToolHandler(name, (args ?? {}) as Record<string, unknown>) as any;
  });

  // 5. Connect stdio transport ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 6. Start web UI + HTTP MCP transport ────────────────────────────────────
  startWebServer(allTools, loggingToolHandler);

  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "server_ready",
    message: `MCP server ready. ${allTools.length} tool(s) across ${networks.join(", ")}.`,
    data: { toolCount: allTools.length, networks },
  });

  console.error("[mcp] Stdio transport ready.");
}

main().catch(async (err: unknown) => {
  console.error("[fatal]", err);
  logFatal("Unhandled startup error", err);
  process.exit(1);
});
