# Planned Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 4 planned improvements: per-network address map throughout, `/api/wallet` endpoint, multi-network UI badges, consolidated boot log, and emergency transfer tool.

**Architecture:** Root change is replacing `address: string` with `addresses: Record<string, string>` in `ServerStatus`. All other changes flow from that — API responses, web UI, log entry, and the emergency tool which requires `walletProvider` instances to be surfaced from `initNetwork()`.

**Tech Stack:** TypeScript, Node.js 20, `@coinbase/agentkit` (`CdpEvmWalletProvider`), viem (via `getPublicClient()`), no test framework — use `npm run build` for type checking and `npm run test:ui` for integration assertions.

**Spec:** `docs/superpowers/specs/2026-03-14-planned-improvements-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/index.ts` | Add `walletProvider` to `initNetwork()` return; build `addressMap` + `walletProviders` map; update `startWebServer()` call; update `server_ready` log; add `emergencyTransfer()` fn + conditional tool registration |
| `src/webServer.ts` | Update `ServerStatus` interface (`addresses`, `dataDir`); update `/api/status` response; add `/api/wallet` route; rewrite address badge JS in `buildHtml()` using DOM methods |
| `scripts/test-ui.ts` | Update `startWebServer()` call to new signature; add assertions for `/api/status` and `/api/wallet` |

---

## Chunk 1: Data Model, API Endpoints, Log, and UI

### Task 1: Add assertions to `test:ui` for new API shapes

Write the assertions first — they will fail once we update `startWebServer()`'s signature, acting as our test gate.

**Files:**
- Modify: `scripts/test-ui.ts`

- [ ] **Step 1: Update `startWebServer()` call and add new assertions**

In `scripts/test-ui.ts`, replace the `startWebServer(MOCK_TOOLS as never)` call at line 107:

```ts
// Replace:
startWebServer(MOCK_TOOLS as never);

// With:
startWebServer(MOCK_TOOLS as never, async () => ({}), {
  addresses: {
    "base-sepolia": "0x510D2b204A4496D34fee7EFbF563dACE3C441b7f",
    "base-mainnet": "0x7dD5Acd498BCF96832f82684584734cF48c7318D",
  },
  networks: ["base-sepolia", "base-mainnet"],
  startedAt: new Date(),
  dataDir: "/tmp/test-data",
});
```

Add these assertions after the `GET /api/logs?limit` block:
```ts
  // GET /api/status
  const statusRes = await fetch(`http://localhost:${port}/api/status`);
  assert("GET /api/status  ->  200", statusRes.status === 200);
  assert("GET /api/status  ->  JSON", statusRes.headers.get("content-type")?.includes("application/json") ?? false);
  const statusBody = await statusRes.json() as Record<string, unknown>;
  assert("GET /api/status  ->  has networks array",  Array.isArray(statusBody.networks));
  assert("GET /api/status  ->  has addresses object", typeof statusBody.addresses === "object" && statusBody.addresses !== null);
  assert("GET /api/status  ->  has toolCount",        typeof statusBody.toolCount === "number");
  assert("GET /api/status  ->  has uptimeMs",         typeof statusBody.uptimeMs === "number");
  assert("GET /api/status  ->  no 'address' field",   !("address" in statusBody));
  const addrs = statusBody.addresses as Record<string, string>;
  assert("GET /api/status  ->  base-sepolia address present", typeof addrs["base-sepolia"] === "string");

  // GET /api/wallet
  const walletRes = await fetch(`http://localhost:${port}/api/wallet`);
  assert("GET /api/wallet  ->  200", walletRes.status === 200);
  assert("GET /api/wallet  ->  JSON", walletRes.headers.get("content-type")?.includes("application/json") ?? false);
  const walletBody = await walletRes.json() as Record<string, unknown>;
  assert("GET /api/wallet  ->  has networks",      Array.isArray(walletBody.networks));
  assert("GET /api/wallet  ->  has addresses",     typeof walletBody.addresses === "object" && walletBody.addresses !== null);
  assert("GET /api/wallet  ->  has dataDir",       typeof walletBody.dataDir === "string");
  assert("GET /api/wallet  ->  has addressFiles",  typeof walletBody.addressFiles === "object" && walletBody.addressFiles !== null);
  const files = walletBody.addressFiles as Record<string, string>;
  assert("GET /api/wallet  ->  addressFiles keyed by network", typeof files["base-sepolia"] === "string");
  assert("GET /api/wallet  ->  addressFiles contain dataDir prefix", files["base-sepolia"].startsWith("/tmp/test-data"));
```

- [ ] **Step 2: Verify build fails (TypeScript catches the signature mismatch)**

```bash
cd c:/ws/coinbase-mcp-server && npm run build
```

Expected: TypeScript error. Note: `test-ui.ts` line 107 already had a pre-existing mismatch (1-argument call vs 3-argument signature), so the build was already failing before you started. After Step 1, it will fail for a different reason (the new `status` object shape with `addresses:` doesn't match the old `ServerStatus` with `address:`). Either way the gate is active — proceed to Task 2.

---

### Task 2: Update `ServerStatus` interface and `startWebServer()` signature

**Files:**
- Modify: `src/webServer.ts:13-17`

- [ ] **Step 1: Replace `ServerStatus` interface**

In `src/webServer.ts`, replace:
```ts
interface ServerStatus {
  address: string;
  networks: string[];
  startedAt: Date;
}
```

With:
```ts
interface ServerStatus {
  addresses: Record<string, string>;
  networks: string[];
  startedAt: Date;
  dataDir: string;
}
```

- [ ] **Step 2: Build to see all downstream type errors**

```bash
npm run build
```

Expected: Multiple errors referencing `status.address` — these are the locations to fix in Tasks 3 and 4.

---

### Task 3: Update `/api/status` route handler

**Files:**
- Modify: `src/webServer.ts` — `/api/status` case

- [ ] **Step 1: Replace `/api/status` response body**

Find the `/api/status` case in the switch statement and replace the `res.end(...)` call:

```ts
case "/api/status":
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({
    networks: status.networks,
    addresses: status.addresses,
    toolCount: tools.length,
    uptimeMs: Date.now() - status.startedAt.getTime(),
  }));
  break;
```

- [ ] **Step 2: Build — should have fewer errors now**

```bash
npm run build
```

Expected: Remaining errors are in the web UI JS (references to `status.address`) and `index.ts` caller.

---

### Task 4: Add `/api/wallet` route handler

**Files:**
- Modify: `src/webServer.ts` — add case before `default:`

- [ ] **Step 1: Add the `/api/wallet` case**

Insert before the `default:` case in the switch statement:

```ts
case "/api/wallet": {
  const addressFiles: Record<string, string> = {};
  for (const net of status.networks) {
    addressFiles[net] = `${status.dataDir}/${net}-address.txt`;
  }
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({
    networks: status.networks,
    addresses: status.addresses,
    dataDir: status.dataDir,
    addressFiles,
  }));
  break;
}
```

---

### Task 5: Update web UI address badge JS

The `buildHtml()` function contains inline JavaScript that references `status.address`. Replace it with DOM-method-based multi-network badge rendering. Use `createElement`/`textContent`/`appendChild` rather than `innerHTML` with dynamic content — this is the approach used here regardless of the spec's alternative `innerHTML`+`esc()` snippet (both are safe; DOM methods are preferred).

**Files:**
- Modify: `src/webServer.ts` — `buildHtml()` JS section

- [ ] **Step 1: Replace the address badge block in the JS**

In `buildHtml()`, find the block that contains `var addr = status.address;` and replace from that line through the closing `};` of the `addrBadge.onclick` assignment.

Replace:
```js
          var addr = status.address;
          var short = addr.slice(0, 6) + '\u2026' + addr.slice(-4);
          addrBadge.textContent = short;
          addrBadge.title = addr + ' (click to copy)';
          addrBadge.style.display = '';
          addrBadge.onclick = function() {
            navigator.clipboard.writeText(addr).then(function() {
              addrBadge.textContent = 'Copied!';
              setTimeout(function() { addrBadge.textContent = short; }, 1500);
            });
          };
```

With:
```js
          addrBadge.style.display = '';
          addrBadge.title = '';
          addrBadge.textContent = '';
          Object.entries(status.addresses).forEach(function(entry) {
            var net = entry[0]; var addr = entry[1];
            var short = addr.slice(0, 6) + '\u2026' + addr.slice(-4);
            var chip = document.createElement('span');
            chip.className = 'addr-chip';
            chip.dataset.addr = addr;
            chip.title = addr + ' (click to copy)';
            chip.textContent = net + ': ' + short;
            chip.style.cursor = 'pointer';
            addrBadge.appendChild(chip);
          });
          addrBadge.onclick = function(e) {
            var chip = e.target.closest('.addr-chip');
            if (!chip) return;
            var fullAddr = chip.dataset.addr;
            navigator.clipboard.writeText(fullAddr).then(function() {
              var prev = chip.textContent;
              chip.textContent = 'Copied!';
              setTimeout(function() { chip.textContent = prev; }, 1500);
            });
          };
```

- [ ] **Step 2: Build — should only have errors in `index.ts` callers**

```bash
npm run build
```

Expected: Errors only in `src/index.ts` at the `startWebServer(...)` call site.

---

### Task 6: Update `initNetwork()` return type in `index.ts`

**Files:**
- Modify: `src/index.ts` — `initNetwork()` signature and return

- [ ] **Step 1: Add `walletProvider` to return type and return statement**

Update the `initNetwork()` function return type:
```ts
async function initNetwork(
  networkId: string,
  apiKeyId: string,
  apiKeySecret: string,
  walletSecret: string,
): Promise<{ tools: Tool[]; toolHandler: RawToolHandler; address: string; walletProvider: CdpEvmWalletProvider }> {
```

Update the return statement at the bottom of `initNetwork()`:
```ts
  const { tools, toolHandler } = await getMcpTools(agentKit);
  return { tools, toolHandler, address, walletProvider };
```

---

### Task 7: Replace `primaryAddress` with `addressMap` in `main()`

**Files:**
- Modify: `src/index.ts` — `main()` network init loop

- [ ] **Step 1: Replace `primaryAddress` with `addressMap` and `walletProviders`**

In `main()`, replace:
```ts
  let primaryAddress = "";
  for (const networkId of networks) {
```

With:
```ts
  const addressMap: Record<string, string> = {};
  const walletProviders = new Map<string, CdpEvmWalletProvider>();
  for (const networkId of networks) {
```

- [ ] **Step 2: Update the destructuring and capture inside the loop**

Replace:
```ts
    const { tools, toolHandler, address } = await initNetwork(
      networkId, apiKeyId, apiKeySecret, walletSecret,
    );
    if (!primaryAddress) primaryAddress = address;
```

With:
```ts
    const { tools, toolHandler, address, walletProvider } = await initNetwork(
      networkId, apiKeyId, apiKeySecret, walletSecret,
    );
    addressMap[networkId] = address;
    walletProviders.set(networkId, walletProvider);
```

- [ ] **Step 3: Update `startWebServer()` call**

Replace:
```ts
  startWebServer(allTools, loggingToolHandler, {
    address: primaryAddress,
    networks,
    startedAt: new Date(),
  });
```

With:
```ts
  startWebServer(allTools, loggingToolHandler, {
    addresses: addressMap,
    networks,
    startedAt: new Date(),
    dataDir: DATA_DIR,
  });
```

---

### Task 8: Update `server_ready` log entry

**Files:**
- Modify: `src/index.ts` — `writeLog()` call for `server_ready`

- [ ] **Step 1: Add `addresses` to the `server_ready` log data**

Replace:
```ts
  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "server_ready",
    message: `MCP server ready. ${allTools.length} tool(s) across ${networks.join(", ")}.`,
    data: { toolCount: allTools.length, networks },
  });
```

With:
```ts
  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "server_ready",
    message: `MCP server ready. ${allTools.length} tool(s) across ${networks.join(", ")}.`,
    data: { toolCount: allTools.length, networks, addresses: addressMap },
  });
```

- [ ] **Step 2: Build — must compile clean**

```bash
npm run build
```

Expected: **0 errors.** If errors remain, fix them before continuing.

---

### Task 9: Run integration tests and commit Chunk 1

- [ ] **Step 1: Run `test:ui`**

```bash
npm run test:ui
```

Expected (all assertions pass):
```
  ✅  GET /api/status  ->  200
  ✅  GET /api/status  ->  JSON
  ✅  GET /api/status  ->  has networks array
  ✅  GET /api/status  ->  has addresses object
  ✅  GET /api/status  ->  has toolCount
  ✅  GET /api/status  ->  has uptimeMs
  ✅  GET /api/status  ->  no 'address' field
  ✅  GET /api/status  ->  base-sepolia address present
  ✅  GET /api/wallet  ->  200
  ✅  GET /api/wallet  ->  JSON
  ✅  GET /api/wallet  ->  has networks
  ✅  GET /api/wallet  ->  has addresses
  ✅  GET /api/wallet  ->  has dataDir
  ✅  GET /api/wallet  ->  has addressFiles
  ✅  GET /api/wallet  ->  addressFiles keyed by network
  ✅  GET /api/wallet  ->  addressFiles contain dataDir prefix
  ...
-- Results  N passed · 0 failed
```

If any test fails, fix before committing.

- [ ] **Step 2: Commit**

```bash
git add src/index.ts src/webServer.ts scripts/test-ui.ts
git commit -m "feat: per-network address map, /api/wallet endpoint, multi-network UI badges, server_ready log addresses"
```

---

## Chunk 2: Emergency Transfer Tool

### Task 10: Add `emergencyTransfer` helper function

**Files:**
- Modify: `src/index.ts` — add function after `buildActionProviders()`, before `initNetwork()`

- [ ] **Step 1: Add `emergencyTransfer` function**

Insert after the closing `}` of `buildActionProviders()`:

```ts
// ── Emergency transfer ────────────────────────────────────────────────────────

async function emergencyTransfer(
  walletProvider: CdpEvmWalletProvider,
  destination: string,
): Promise<{ txHash: string; amountSentWei: string; destination: string }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) {
    throw new Error(`Invalid destination address: ${destination}`);
  }

  const balance: bigint = await walletProvider.getBalance();

  const GAS_LIMIT = 21_000n;
  const gasPrice: bigint = await walletProvider.getPublicClient().getGasPrice();
  const gasCost = GAS_LIMIT * gasPrice;

  if (balance <= gasCost) {
    throw new Error(
      `Insufficient balance (${balance} wei) to cover gas cost (${gasCost} wei)`
    );
  }

  const sendAmount: bigint = balance - gasCost;
  // nativeTransfer(to, value) — value is a decimal string of wei, e.g. "999978000000000000"
  const txHash = await walletProvider.nativeTransfer(
    destination as `0x${string}`,
    sendAmount.toString(),
  );

  return { txHash, amountSentWei: sendAmount.toString(), destination };
}
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
npm run build
```

Expected: 0 errors.

---

### Task 11: Register `emergency_transfer_all` tool conditionally in `main()`

**Files:**
- Modify: `src/index.ts` — inside `main()`, after `allTools` is assembled, before the stdio MCP server starts

- [ ] **Step 1: Add conditional tool registration block**

Insert after the `for (const [, entry] of toolRegistry)` loop that builds `allTools`, and before the `console.error` line that logs the unique tool count:

```ts
  // ── Emergency transfer tool (opt-in via ALLOW_EMERGENCY_TRANSFER=true) ───────
  if (process.env.ALLOW_EMERGENCY_TRANSFER === "true") {
    const emergencySchema: Tool = {
      name: "emergency_transfer_all",
      description:
        "EMERGENCY USE ONLY: Transfers the entire native balance (minus gas) to a destination address. " +
        "Only available when ALLOW_EMERGENCY_TRANSFER=true is set on the server.",
      inputSchema: {
        type: "object",
        required: ["destination"],
        properties: {
          destination: {
            type: "string",
            description: "Destination wallet address (0x...)",
          },
          ...(multiNetwork
            ? {
                network: {
                  type: "string",
                  enum: networks,
                  default: networks[0],
                  description: `Blockchain network to drain. Available: ${networks.join(", ")}`,
                },
              }
            : {}),
        },
      },
    };

    const emergencyHandlers = new Map<string, RawToolHandler>();
    for (const [netId, wp] of walletProviders) {
      emergencyHandlers.set(netId, async (_name, args) => {
        const destination = args.destination as string;
        return emergencyTransfer(wp, destination);
      });
    }

    toolRegistry.set("emergency_transfer_all", {
      schema: emergencySchema,
      handlers: emergencyHandlers,
    });
    allTools.push(emergencySchema);

    logBoot("Emergency transfer tool registered (ALLOW_EMERGENCY_TRANSFER=true)");
    console.error("[boot] ALLOW_EMERGENCY_TRANSFER=true — emergency_transfer_all tool is active");
  }
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: 0 errors.

---

### Task 12: Add `test:ui` assertion and manual smoke test

**Files:**
- Modify: `scripts/test-ui.ts`

- [ ] **Step 1: Add emergency tool absence assertion**

After the `/api/wallet` assertions, add:

```ts
  // Emergency transfer tool must be absent without ALLOW_EMERGENCY_TRANSFER=true
  const toolNames = (tools as Array<{ name: string }>).map(t => t.name);
  assert(
    "emergency_transfer_all absent without ALLOW_EMERGENCY_TRANSFER",
    !toolNames.includes("emergency_transfer_all"),
  );
```

- [ ] **Step 2: Run `test:ui` — all assertions must pass**

```bash
npm run test:ui
```

Expected (additions):
```
  ✅  emergency_transfer_all absent without ALLOW_EMERGENCY_TRANSFER
-- Results  N passed · 0 failed
```

- [ ] **Step 3: Smoke test tool registration with env var (manual)**

In one terminal:
```bash
ALLOW_EMERGENCY_TRANSFER=true npm run dev 2>&1 | grep -i emergency
```

Expected output:
```
[boot] ALLOW_EMERGENCY_TRANSFER=true — emergency_transfer_all tool is active
```

In a second terminal:
```bash
curl -s http://localhost:3002/api/tools | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const t=JSON.parse(d); console.log(t.find(x=>x.name==='emergency_transfer_all')?.name ?? 'NOT FOUND')"
```

Expected: `emergency_transfer_all`

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts scripts/test-ui.ts
git commit -m "feat: add emergency_transfer_all tool gated by ALLOW_EMERGENCY_TRANSFER env var"
```

---

## Final Verification

- [ ] **Full clean build**

```bash
npm run build
```

Expected: 0 errors, 0 warnings.

- [ ] **Full test suite**

```bash
npm run test:ui
```

Expected: All assertions pass, 0 failures.

- [ ] **Remove implemented items from CLAUDE.md Planned Improvements section**

Open `CLAUDE.md` and delete the entire "Planned Improvements" section (all 4 items). The features are now implemented and in the code.

- [ ] **Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: remove implemented planned improvements from CLAUDE.md"
```
