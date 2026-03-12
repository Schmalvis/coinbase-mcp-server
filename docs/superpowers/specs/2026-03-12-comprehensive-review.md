# Comprehensive Review: Coinbase AgentKit MCP Server

**Date:** 2026-03-12
**Scope:** Security, Code Quality, UI/UX
**Approach:** Risk-ranked unified findings (Critical → Low)
**Deployment context:** LAN only (home/office network, no internet exposure)
**Codebase:** 3 source files, ~600 lines TypeScript (`src/index.ts`, `src/webServer.ts`, `src/logger.ts`)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 2     |
| Medium   | 5     |
| Low      | 6     |

**Top 3 priorities:**
1. `stack.env` committed to git with stale + placeholder credentials — real secrets can be accidentally committed
2. No request body size limit on `/mcp` POST endpoint — realistic DoS vector even on LAN
3. New MCP `Server` instance created per HTTP request — GC pressure and potential handle leaks under load

---

## Findings

---

### [CRITICAL] `stack.env` tracked by git, not ignored, and contains stale variable names

**Domain:** Security
**File:** `.gitignore:11`, `stack.env`
**Impact:** `.gitignore` explicitly un-ignores `stack.env` with `!stack.env`, so the file is committed and tracked. If a developer fills in real credentials, they will be pushed. Additionally, `stack.env` contains variable names (`CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY`) that are v1-era names — the code in `src/index.ts:102-104` reads `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET`. A developer following `stack.env` as a template would set the wrong variables and be confused when the server fails to start.
**Recommendation:**
1. Remove `!stack.env` from `.gitignore`; add `stack.env` to the ignore list.
2. Rename the file to `stack.env.example`, update `.gitignore` to un-ignore only `stack.env.example`.
3. Fix the variable names in the template to match what `src/index.ts` actually reads: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`.
4. Update any docs that reference `stack.env`.
**Effort:** XS

---

### [HIGH] No request body size limit on the `/mcp` HTTP endpoint

**Domain:** Security
**File:** `src/webServer.ts:63-68`
**Impact:** The `/mcp` POST handler reads the entire request body into a string before parsing. A LAN client (or compromised device) can send an arbitrarily large payload, consuming unbounded memory and potentially crashing the server process.
**Recommendation:** Enforce a body size cap (e.g. 1 MB) while accumulating chunks. Reject with `413 Payload Too Large` if exceeded before passing to the transport.
**Effort:** S

---

### [HIGH] New MCP `Server` instance created per HTTP request — not explicitly closed

**Domain:** Code Quality
**File:** `src/webServer.ts:15-29`, `src/webServer.ts:53-59`
**Impact:** `buildMcpServer()` is called on every `/mcp` POST request, constructing a new `Server` object, registering handlers, and connecting a new transport. These objects are not explicitly destroyed after the request completes. Under any sustained load this creates GC pressure and potential handle leaks.
**Recommendation:** Add a `finally` block after `transport.handleRequest(req, res, parsedBody)` that calls `mcpServer.close()` to clean up the server and transport resources. (Use `mcpServer.close()` not `transport.close()` — the `StreamableHTTPServerTransport` does not expose a `close()` method directly.)
**Effort:** S

---

### [MEDIUM] `readLogs()` reads the entire log file on every `/api/logs` poll

**Domain:** Code Quality
**File:** `src/logger.ts:44-59`
**Impact:** The web UI polls `/api/logs` every 5 seconds. Each poll triggers a full `fs.readFileSync` of the activity log, parses every line, reverses the array, and slices. With 30-day retention the file is bounded (~86 MB at sustained heavy use) but I/O and parse overhead accumulates proportionally over deployment lifetime.
**Recommendation:** Maintain an in-memory ring buffer (e.g. last 500 entries) updated on each `writeLog()` call. Serve `/api/logs` from the buffer rather than re-reading the file. The file remains the source of truth for persistence; the buffer serves the UI efficiently.
**Effort:** M

---

### [MEDIUM] `trimOldLogs()` does a full synchronous file rewrite on every boot

**Domain:** Code Quality
**File:** `src/logger.ts:62-86`
**Impact:** On startup, `trimOldLogs()` reads the entire log file, filters it in memory, and rewrites it synchronously. For large log files this blocks the Node.js event loop during boot — delaying MCP server readiness.
**Recommendation:** Run `trimOldLogs()` asynchronously using `fs.promises`, or defer it with `setImmediate()`/`setTimeout()` so the MCP server connects before the trim runs.
**Effort:** S

---

### [MEDIUM] `loadTools()` in the web UI fires once and never refreshes

**Domain:** UI/UX
**File:** `src/webServer.ts:558` (JS in `buildHtml()`)
**Impact:** If the server restarts (e.g. container restart or config change), the tools panel in an open browser tab shows stale data forever. Users have no indication the list is outdated without a full page reload.
**Recommendation:** Add `loadTools()` to the `setInterval` alongside `pollLogs()`, or add a separate slower interval (e.g. 30s).
**Effort:** XS

---

### [MEDIUM] No search or filter on the tools panel

**Domain:** UI/UX
**File:** `src/webServer.ts` (`buildHtml()`)
**Impact:** With 17+ tools registered, users must scroll the entire list to find a specific tool. Worsens as more action providers are added.
**Recommendation:** Add a text input above the tools list that filters cards by `name` and `description` in real time (client-side, no server roundtrip).
**Effort:** S

---

### [MEDIUM] "Pause" button initial state is visually misleading

**Domain:** UI/UX
**File:** `src/webServer.ts:469-471` (HTML), `src/webServer.ts:539-542` (JS in `buildHtml()`)
**Impact:** On load, `paused = false` (logs are running) but the Pause button has class `active` (accent-blue styling). Standard UI convention: a button styled `active` signals the current mode is active/engaged, not that the button is available to click. The initial state implies the user has already paused.
**Recommendation:**
- Remove `active` class from the Pause button's initial HTML (`<button id="btn-pause">Pause</button>` — no `active` class).
- In the click handler, set `active` when `paused === true` and remove it when `paused === false`.
- Expected states: **Running** → button label "Pause", no `active` class. **Paused** → button label "Resume", `active` class applied.
**Effort:** XS

---

### [LOW] `cdp_api_key-test.json` present in repo root

**Domain:** Security
**File:** `cdp_api_key-test.json`
**Impact:** The file is correctly gitignored by the `cdp_api_key*.json` glob (verified: `git ls-files` returns empty). Risk is low for a LAN-only server. However, the file may contain real credentials and its presence is unnecessary clutter.
**Recommendation:** Delete the file from the working directory. If a key file is needed for testing scripts, use environment variables or store it outside the repo directory.
**Effort:** XS

---

### [LOW] `NetworkedTool` interface defined inside `main()` function body

**Domain:** Code Quality
**File:** `src/index.ts:120-123`
**Impact:** TypeScript interfaces defined inside function bodies are valid but unconventional. It prevents reuse and disrupts readability by breaking the flow of `main()`.
**Recommendation:** Move `NetworkedTool` to the top-level types section alongside `RawToolHandler` at `src/index.ts:41-43`.
**Effort:** XS

---

### [LOW] No wallet address or active network displayed in the UI

**Domain:** UI/UX
**File:** `src/webServer.ts` (`buildHtml()`, `startWebServer()`)
**Impact:** The server knows the wallet address and active networks at boot time, but this information is never surfaced in the UI. Operators must check logs or stderr to confirm which wallet/network is active.
**Recommendation:** Expose a `/api/status` endpoint returning `{ address, networks, toolCount, uptime }`. Display wallet address (truncated with copy-on-click) and network badge in the header.
**Effort:** S

---

### [LOW] "Online" status pill is hardcoded — no actual health check

**Domain:** UI/UX
**File:** `src/webServer.ts:449` (HTML in `buildHtml()`)
**Impact:** The green "Online" pill is static HTML. It shows green even if the MCP server failed to initialise or the CDP API is unreachable.
**Recommendation:** Drive the status pill from the `/api/status` endpoint (see above). If the fetch fails, show amber with "Degraded". This finding depends on `/api/status` being added first.
**Effort:** S

---

### [LOW] Log rows truncate with no expand affordance

**Domain:** UI/UX
**File:** `src/webServer.ts` (`buildHtml()`)
**Impact:** Long log messages (e.g. tool call arguments) are clipped with ellipsis. There is no way to read the full message or inspect the `data` payload without opening browser DevTools.
**Recommendation:** Make log rows clickable to expand into a multi-line view showing the full message and formatted JSON `data` field.
**Effort:** S

---

### [LOW] Fixed 320px left panel breaks on narrow viewports

**Domain:** UI/UX
**File:** `src/webServer.ts:272-276` (CSS in `buildHtml()`)
**Impact:** `grid-template-columns: 320px 1fr` overflows horizontally on viewports narrower than ~600px (browser zoom-out, tablet).
**Recommendation:** Replace with `minmax(240px, 320px) 1fr`, and add a `@media (max-width: 640px)` breakpoint that stacks panels vertically.
**Effort:** S

---

## Delivery Plan

1. **Findings report** (this document) — ✅ complete
2. **Implementation plan** — to be created via `writing-plans` skill, tasks sequenced Critical → High → Medium → Low
3. **Fixes** — implemented task-by-task per the plan, verified before each task is marked complete

---

## Out of Scope

- Dependency audit (`npm audit`) — not run; treat as a separate maintenance task
- AgentKit provider security — trust the upstream `@coinbase/agentkit` library
- Authentication/authorization — explicitly out of scope for LAN-only deployment per user requirements
