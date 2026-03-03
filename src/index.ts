import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { getMcpTools } from "@coinbase/agentkit-model-context-protocol";
import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as crypto from "crypto";
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

/**
 * Persisted UUID used as the Idempotency-Key header on CDP CreateWallet calls.
 * Reusing the same key within 24 hours causes CDP to return the same wallet
 * instead of creating a new one, making rapid restarts safe even under rate limits.
 */
const IDEMPOTENCY_KEY_FILE = path.join(path.dirname(WALLET_DATA_FILE), ".wallet_idempotency_key");

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

/**
 * Returns a persistent UUID used as the CDP API idempotency key.
 * Creates and saves a new one on first call; reloads on subsequent calls.
 */
function getOrCreateIdempotencyKey(): string {
  if (fs.existsSync(IDEMPOTENCY_KEY_FILE)) {
    const stored = fs.readFileSync(IDEMPOTENCY_KEY_FILE, "utf-8").trim();
    if (stored) return stored;
  }
  const key = crypto.randomUUID();
  fs.mkdirSync(path.dirname(IDEMPOTENCY_KEY_FILE), { recursive: true });
  fs.writeFileSync(IDEMPOTENCY_KEY_FILE, key, "utf-8");
  return key;
}

/**
 * Wraps Coinbase.apiClients.wallet.createWallet to inject the Idempotency-Key
 * header. Must be called after Coinbase.configure() has populated apiClients.
 * With this header set, CDP returns the same wallet for retries within 24 hours
 * rather than creating a new one — safe even under rate-limit restart loops.
 */
function patchWalletApiWithIdempotency(key: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletApi = (Coinbase as any).apiClients?.wallet;
  if (!walletApi?.createWallet) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = walletApi.createWallet.bind(walletApi) as (...a: any[]) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletApi.createWallet = (req?: unknown, opts?: any) =>
    original(req, { ...opts, headers: { ...(opts?.headers ?? {}), "Idempotency-Key": key } });
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
  const mnemonicPhrase = process.env.MNEMONIC_PHRASE || undefined;

  // 2a. Configure Coinbase SDK (same as what configureWithWallet does internally)
  //     Done here so we can patch apiClients before any CreateWallet call.
  Coinbase.configure({ apiKeyName, privateKey: apiKeyPrivateKey.replace(/\\n/g, "\n") });

  // 2b. Inject a persistent idempotency key so CDP returns the same wallet on
  //     retry within 24 hours rather than attempting to create a new one.
  //     This is the primary defence against rate-limit restart loops.
  const idempotencyKey = getOrCreateIdempotencyKey();
  patchWalletApiWithIdempotency(idempotencyKey);

  // 2c. Load existing wallet or create/register a new one via CDP API
  let wallet: Wallet;
  if (cdpWalletData) {
    const msg = `Resuming existing wallet from ${WALLET_DATA_FILE}`;
    console.error("[boot]", msg);
    logBoot(msg);
    wallet = await Wallet.import(JSON.parse(cdpWalletData));
  } else if (mnemonicPhrase) {
    const msg = `No wallet file found – registering deterministic wallet from mnemonic via CDP API. Idempotency key: ${idempotencyKey}`;
    console.error("[boot]", msg);
    logBoot(msg);
    wallet = await Wallet.import({ mnemonicPhrase }, networkId);
  } else {
    const msg = `No wallet file found – creating new MPC wallet via CDP API. Idempotency key: ${idempotencyKey}`;
    console.error("[boot]", msg);
    logBoot(msg);
    wallet = await Wallet.create({ networkId });
  }

  // 2d. Wrap in CdpWalletProvider — pass wallet object directly so configureWithWallet
  //     does not call CreateWallet again.
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName,
    apiKeyPrivateKey,
    networkId,
    wallet,
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
