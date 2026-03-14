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

### `src/index.ts` — `main()`

Replace:
```ts
let primaryAddress = "";
// ...
if (!primaryAddress) primaryAddress = address;
```

With:
```ts
const addressMap: Record<string, string> = {};
// ...
addressMap[networkId] = address;
```

Pass `addressMap` to `startWebServer()` and to the `server_ready` log entry.

### `src/webServer.ts` — `ServerStatus` interface

```ts
// Before
interface ServerStatus {
  address: string;
  networks: string[];
  startedAt: Date;
}

// After
interface ServerStatus {
  addresses: Record<string, string>;
  networks: string[];
  startedAt: Date;
}
```

All internal references to `status.address` are replaced with lookups from `status.addresses`.

---

## 2. Improvement 1 — Wallet Address Visible in Web UI

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

- **Single network:** one address badge, truncated `0x1234…5678`, click to copy (existing behaviour, updated to read from `addresses`).
- **Multi-network:** one address badge per network, each labelled with the network name, each copyable.

The existing `address-badge` element becomes a container. In multi-network mode it renders one badge per entry in `status.addresses`.

---

## 3. Improvement 2 — Emergency Native Transfer Tool

### Activation

Registered into `allTools` and `toolRegistry` only when `ALLOW_EMERGENCY_TRANSFER=true`. If the env var is absent or any other value, the tool does not exist in the MCP tool list.

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

### Implementation

```
1. Validate: destination must match /^0x[0-9a-fA-F]{40}$/
2. balance = await walletProvider.getBalance()            // bigint, wei
3. publicClient = walletProvider.getPublicClient()
4. gasEstimate = await publicClient.estimateGas({ to: destination, value: balance })
5. gasPrice = await publicClient.getGasPrice()
6. gasCost = gasEstimate * gasPrice
7. if (balance <= gasCost) → return error "Insufficient balance to cover gas"
8. sendAmount = balance - gasCost
9. txHash = await walletProvider.nativeTransfer(destination, sendAmount.toString())
10. return { txHash, amountSentWei: sendAmount.toString(), destination, network }
```

Uses `logToolCall` / `logToolResult` via the existing `loggingToolHandler` — no special logging required.

### Guard rails

- Env var gate: off by default
- Destination address regex validation before any RPC call
- Balance ≤ gasCost check before transfer
- Each network has its own handler closure capturing that network's `walletProvider` instance

### Location in `main()`

Inserted after the network init loop and after `allTools` is built, but before the MCP server is started. A separate `walletProviders` map (`Map<networkId, CdpEvmWalletProvider>`) is built during the init loop alongside `toolRegistry`.

---

## 4. Improvement 3 — Wallet Data Export Endpoint

### `GET /api/wallet`

Diagnostic endpoint. Returns per-network addresses, where files are stored, and the data directory path. No key material.

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

`dataDir` and `addressFiles` are passed into `startWebServer()` as part of `ServerStatus` (or computed from `networks` inside the handler using the same path logic as `index.ts`).

### Implementation note

To avoid duplicating the path logic, `startWebServer()` receives `dataDir: string` in `ServerStatus` and computes `addressFiles` from `networks` and `dataDir` inline.

---

## 5. Improvement 4 — server_ready Log Entry with All Addresses

The existing `server_ready` `writeLog()` call in `main()` is updated to include `addresses` in its `data` payload:

```ts
writeLog({
  ts: new Date().toISOString(),
  level: "info",
  event: "server_ready",
  message: `MCP server ready. ${allTools.length} tool(s) across ${networks.join(", ")}.`,
  data: { toolCount: allTools.length, networks, addresses: addressMap },
});
```

Individual per-network boot entries remain unchanged.

---

## Data Flow Summary

```
main()
  ├─ initNetwork(networkId, ...) → { tools, toolHandler, address }
  ├─ addressMap[networkId] = address          ← new
  ├─ walletProviders.set(networkId, provider) ← new (for emergency tool)
  │
  ├─ [if ALLOW_EMERGENCY_TRANSFER] register emergency_transfer_all
  │
  ├─ startWebServer(allTools, loggingToolHandler, {
  │    addresses: addressMap,                 ← changed (was address: primaryAddress)
  │    networks,
  │    startedAt,
  │    dataDir: "/app/data",                 ← new
  │  })
  │
  └─ writeLog(server_ready, { ..., addresses: addressMap })  ← new
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `getBalance()` fails | Tool returns error string, logged as `tool_error` |
| Gas estimation fails | Tool returns error string |
| Balance ≤ gas cost | Tool returns descriptive error, no transfer attempted |
| Invalid destination | Tool returns validation error, no RPC call made |
| `nativeTransfer` fails | Exception propagates through `loggingToolHandler`, logged as `tool_error` |

---

## Testing Checklist

- [ ] Single-network mode: `/api/status` returns `addresses` with one key
- [ ] Multi-network mode: `/api/status` returns `addresses` with all networks
- [ ] `/api/wallet` returns `dataDir` and correct `addressFiles` paths
- [ ] Web UI single-network: address badge shows truncated address, click copies full
- [ ] Web UI multi-network: one badge per network, labelled, each copyable
- [ ] `server_ready` log entry contains `addresses` map
- [ ] `ALLOW_EMERGENCY_TRANSFER` unset: tool absent from tool list
- [ ] `ALLOW_EMERGENCY_TRANSFER=true`: tool present, validates destination, transfers, logs
- [ ] Emergency tool: balance ≤ gas returns error without transfer
- [ ] Emergency tool: invalid destination returns error without RPC call
