# Design: Planned Improvements — Coinbase AgentKit MCP Server

**Date:** 2026-03-14
**Status:** Approved
**Scope:** All 4 planned improvements from CLAUDE.md

---

## Overview

Four improvements are implemented together as a single batch because improvements 1, 3, and 4 share a common root change: replacing the single `address: string` field in `ServerStatus` with `addresses: Record<string, string>` (a per-network map). Improvement 2 (emergency transfer) is independent but included in the same release.

Files touched: `src/index.ts`, `src/webServer.ts` only.

---

## 1. Shared Data Model Change

**Root change that improvements 1, 3, and 4 all depend on.**

### `src/index.ts` - `initNetwork()` return type

Add `walletProvider: CdpEvmWalletProvider` to the return value so `main()` can build the providers map needed by the emergency transfer tool:

```ts
async function initNetwork(...): Promise<{
  tools: Tool[];
  toolHandler: RawToolHandler;
  address: string;
  walletProvider: CdpEvmWalletProvider;   // <- new
}>
```

And in the return statement at the end of `initNetwork()`:
```ts
return { tools, toolHandler, address, walletProvider };
```

### `src/index.ts` - `main()`

Replace:
```ts
let primaryAddress = "";
// ...
if (!primaryAddress) primaryAddress = address;
```

With:
```ts
const addressMap: Record<string, string> = {};
const walletProviders = new Map<string, CdpEvmWalletProvider>();
// ...
addressMap[networkId] = address;
walletProviders.set(networkId, walletProvider);
```

Pass `addressMap` to `startWebServer()` and to the `server_ready` log entry.

### `src/webServer.ts` - `ServerStatus` interface

```ts
// Before
interface ServerStatus {
  address: string;
  networks: string[];
  startedAt: Date;
}

// After
interface ServerStatus {
  addresses: Record<string, string>;   // { "base-sepolia": "0x...", "base-mainnet": "0x..." }
  networks: string[];
  startedAt: Date;
  dataDir: string;                     // e.g. "/app/data" - used by /api/wallet
}
```

---

## 2. Improvement 1 - Wallet Address Visible in Web UI

### `/api/status` response shape (updated)

```json
{
  "networks": ["base-sepolia", "base-mainnet"],
  "addresses": { "base-sepolia": "0x...", "base-mainnet": "0x..." },
  "toolCount": 39,
  "uptimeMs": 12345
}
```

`startedAt` is used internally to compute `uptimeMs` but not included in the response.

### Web UI header

- **Single network:** one address badge, truncated `0x1234...5678`, click to copy.
- **Multi-network:** one address badge per network, labelled with network name, each copyable.

The existing `address-badge` `<span>` becomes a container. The `loadTools()` JS function
replaces the single-badge block. The existing `esc()` helper is used to sanitize all values
before inserting into the DOM via `innerHTML`, preventing XSS:

```js
// Replace the single-badge block (status.address reference) with:
addrBadge.style.display = '';
addrBadge.innerHTML = Object.entries(status.addresses).map(function([net, addr]) {
  var short = addr.slice(0, 6) + '\u2026' + addr.slice(-4);
  return '<span class="addr-chip" data-addr="' + esc(addr) + '" title="' + esc(addr) + ' (click to copy)" style="cursor:pointer">'
    + esc(net) + ': ' + esc(short) + '</span>';
}).join(' ');
addrBadge.onclick = function(e) {
  var chip = e.target.closest('.addr-chip');
  if (!chip) return;
  var addr = chip.dataset.addr;
  navigator.clipboard.writeText(addr).then(function() {
    var prev = chip.textContent;
    chip.textContent = 'Copied!';
    setTimeout(function() { chip.textContent = prev; }, 1500);
  });
};
```

Note: `esc()` (already defined in `buildHtml()`) HTML-encodes `&`, `<`, `>`, and `"`.
All dynamic values (`net`, `addr`, `short`) are passed through `esc()` before use in the
template string, making this safe against any unexpected characters in address or network values.

Remove the old `addr` / `short` / `addrBadge.onclick` block that referenced `status.address`.

---

## 3. Improvement 2 - Emergency Native Transfer Tool

### Activation

Registered into `allTools` and `toolRegistry` only when `ALLOW_EMERGENCY_TRANSFER=true`. If the env var is absent or any other value, the tool does not appear in the MCP tool list.

### Tool name

`emergency_transfer_all`

### Input schema

```json
{
  "type": "object",
  "required": ["destination"],
  "properties": {
    "destination": {
      "type": "string",
      "description": "Destination address to receive all funds (0x...)"
    },
    "network": {
      "type": "string",
      "enum": ["base-sepolia", "base-mainnet"],
      "description": "Network to transfer from (multi-network mode only)"
    }
  }
}
```

The `network` parameter is only included when `multiNetwork` is true (same pattern as other tools).

### Gas estimation

Plain native ETH transfers to an EOA always cost exactly 21,000 gas units. Rather than calling `estimateGas` with a `value` equal to the full balance (which causes the EVM simulation to revert — the wallet cannot simultaneously pay gas + send the full balance), use the constant:

```ts
const GAS_LIMIT = 21_000n;
const gasPrice = await walletProvider.getPublicClient().getGasPrice();  // bigint, wei
const gasCost = GAS_LIMIT * gasPrice;
```

### Implementation

```ts
async function emergencyTransfer(
  walletProvider: CdpEvmWalletProvider,
  destination: string,
): Promise<{ txHash: string; amountSentWei: string; destination: string }> {
  // 1. Validate destination
  if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) {
    throw new Error(`Invalid destination address: ${destination}`);
  }

  // 2. Fetch balance
  const balance: bigint = await walletProvider.getBalance();

  // 3. Estimate gas cost (plain ETH transfer = 21,000 gas, never use estimateGas with full balance)
  const GAS_LIMIT = 21_000n;
  const gasPrice: bigint = await walletProvider.getPublicClient().getGasPrice();
  const gasCost = GAS_LIMIT * gasPrice;

  // 4. Guard: insufficient balance
  if (balance <= gasCost) {
    throw new Error(
      `Insufficient balance (${balance} wei) to cover gas cost (${gasCost} wei)`
    );
  }

  // 5. Transfer
  // nativeTransfer(to: Address, value: string) — value is a decimal string of wei
  // e.g. "999978000000000000" (NOT an ETH amount, NOT a bigint)
  const sendAmount: bigint = balance - gasCost;
  const txHash = await walletProvider.nativeTransfer(
    destination as `0x${string}`,
    sendAmount.toString(),   // decimal string of wei, e.g. "999978000000000000"
  );

  return { txHash, amountSentWei: sendAmount.toString(), destination };
}
```

### Registration in `main()`

After `allTools` is built, before the MCP server is started:

```ts
if (process.env.ALLOW_EMERGENCY_TRANSFER === "true") {
  const emergencySchema: Tool = {
    name: "emergency_transfer_all",
    description: "Transfer entire native balance (minus gas) to a destination address. Safety escape hatch.",
    inputSchema: {
      type: "object",
      required: ["destination"],
      properties: {
        destination: { type: "string", description: "Destination address (0x...)" },
        ...(multiNetwork ? {
          network: { type: "string", enum: networks, default: networks[0], description: "Network to transfer from" }
        } : {}),
      },
    },
  };

  const emergencyHandlers = new Map<string, RawToolHandler>();
  for (const [netId, wp] of walletProviders) {
    emergencyHandlers.set(netId, async (_, args) => {
      const destination = args.destination as string;
      return emergencyTransfer(wp, destination);
    });
  }

  toolRegistry.set("emergency_transfer_all", { schema: emergencySchema, handlers: emergencyHandlers });
  allTools.push(emergencySchema);
}
```

Uses `logToolCall` / `logToolResult` automatically via the existing `loggingToolHandler`.

### Guard rails summary

- Env var gate: off by default
- Destination address regex validation before any RPC call
- Balance <= gasCost check before transfer
- Each network has its own handler closure capturing that network's `walletProvider` instance

---

## 4. Improvement 3 - Wallet Data Export Endpoint

### `GET /api/wallet`

Diagnostic endpoint. Returns per-network addresses, file paths, and data directory. No key material.

```json
{
  "networks": ["base-sepolia", "base-mainnet"],
  "addresses": { "base-sepolia": "0x...", "base-mainnet": "0x..." },
  "dataDir": "/app/data",
  "addressFiles": {
    "base-sepolia": "/app/data/base-sepolia-address.txt",
    "base-mainnet": "/app/data/base-mainnet-address.txt"
  }
}
```

`addressFiles` is computed inline in the route handler from `status.networks` and `status.dataDir`:

```ts
case "/api/wallet": {
  const addressFiles: Record<string, string> = {};
  for (const net of status.networks) {
    addressFiles[net] = `${status.dataDir}/${net}-address.txt`;
  }
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
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

## 5. Improvement 4 - server_ready Log Entry with All Addresses

The existing `server_ready` `writeLog()` call in `main()` is updated to include `addresses`:

```ts
writeLog({
  ts: new Date().toISOString(),
  level: "info",
  event: "server_ready",
  message: `MCP server ready. ${allTools.length} tool(s) across ${networks.join(", ")}.`,
  data: { toolCount: allTools.length, networks, addresses: addressMap },  // <- add addresses
});
```

Individual per-network boot entries remain unchanged.

---

## Data Flow Summary

```
main()
  |- initNetwork(networkId, ...) -> { tools, toolHandler, address, walletProvider }  <- updated
  |- addressMap[networkId] = address               <- new
  |- walletProviders.set(networkId, walletProvider) <- new
  |
  |- [if ALLOW_EMERGENCY_TRANSFER=true]
  |    register emergency_transfer_all into toolRegistry + allTools
  |
  |- startWebServer(allTools, loggingToolHandler, {
  |    addresses: addressMap,     <- changed (was address: primaryAddress)
  |    networks,
  |    startedAt,
  |    dataDir: DATA_DIR,          <- new (reuse existing const)
  |  })
  |
  +- writeLog(server_ready, { ..., addresses: addressMap })  <- updated
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `getBalance()` fails | Exception propagates, logged as `tool_error` |
| `getGasPrice()` fails | Exception propagates, logged as `tool_error` |
| Balance <= gas cost | Throws, logged as `tool_error`, no transfer attempted |
| Invalid destination format | Throws, logged as `tool_error`, no RPC call made |
| `nativeTransfer` fails | Exception propagates, logged as `tool_error` |

---

## Testing Checklist

- [ ] Single-network mode: `/api/status` returns `addresses` with one key
- [ ] Multi-network mode: `/api/status` returns `addresses` with all networks
- [ ] `/api/wallet` returns `dataDir`, correct `addressFiles` paths, and addresses
- [ ] Web UI single-network: one address badge, truncated, click copies full address
- [ ] Web UI multi-network: one badge per network, labelled with network name, each copyable
- [ ] `server_ready` log entry `data` field contains `addresses` map
- [ ] `ALLOW_EMERGENCY_TRANSFER` unset: `emergency_transfer_all` absent from tool list
- [ ] `ALLOW_EMERGENCY_TRANSFER=true`: tool present, validates destination, transfers, logs
- [ ] Emergency tool: balance <= gas returns error without transfer
- [ ] Emergency tool: invalid destination regex returns error without any RPC call
