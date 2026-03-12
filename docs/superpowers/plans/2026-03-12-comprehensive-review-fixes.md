# Comprehensive Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 14 findings from the 2026-03-12 comprehensive review — security hygiene, code quality, and UI/UX improvements.

**Architecture:** All changes are confined to three source files (`src/index.ts`, `src/logger.ts`, `src/webServer.ts`) plus project config files. No new dependencies required. No test framework exists in this project — verification uses `npm run build` for type-checking and manual curl/browser checks for runtime behaviour.

**Tech Stack:** TypeScript 5, Node.js 20, `@modelcontextprotocol/sdk`, `@coinbase/agentkit`

---

## Chunk 1: Security & Secrets Hygiene

Addresses: [CRITICAL] `stack.env`, [HIGH] body size limit, [LOW] `cdp_api_key-test.json`

---

### Task 1: Fix `stack.env` — rename, correct variable names, fix `.gitignore`

**Files:**
- Create: `stack.env.example`
- Modify: `.gitignore`
- Untrack (git rm --cached): `stack.env`

- [ ] **Step 1: Create `stack.env.example` with correct v2 variable names**

Create the file at `stack.env.example` with this exact content:

```bash
# ── Coinbase Developer Platform credentials (v2 API) ──────────────────────────
# Obtain from https://portal.cdp.coinbase.com → API Keys (select v2)

CDP_API_KEY_ID=your-key-id-here
CDP_API_KEY_SECRET=your-api-key-secret-here
CDP_WALLET_SECRET=your-wallet-secret-here

# ── Network ────────────────────────────────────────────────────────────────────
# Use base-sepolia for development/testing (free testnet funds via faucet).
# Use base-mainnet only when ready for real funds.
# Comma-separated list enables multi-network mode: base-sepolia,base-mainnet
NETWORK_ID=base-sepolia

# ── Web UI ─────────────────────────────────────────────────────────────────────
WEB_PORT=3002

# ── Activity log retention ─────────────────────────────────────────────────────
LOG_RETENTION_DAYS=30

# ── Wallet data storage ────────────────────────────────────────────────────────
# Leave unset to use a Docker-managed named volume (default).
# Set to an absolute host path for a bind mount (directory must exist, owned by UID 1000).
# WALLET_DATA_PATH=/opt/coinbase-mcp/data
```

- [ ] **Step 2: Update `.gitignore`**

The relevant block currently reads:
```
# Environment / secrets — NEVER commit these
.env
*.env
wallet_data.json
!stack.env
# Local secret overrides — copy stack.env → stack.env.local and fill in real values
stack.env.local
```

Change it to:
```
# Environment / secrets — NEVER commit these
.env
*.env
stack.env
wallet_data.json
!stack.env.example
# Local secret overrides — copy stack.env.example → stack.env and fill in real values
stack.env.local
```

- [ ] **Step 3: Untrack `stack.env` from git without deleting it from disk**

```bash
git rm --cached stack.env
```

Expected output: `rm 'stack.env'`

- [ ] **Step 4: Verify staging state**

```bash
git status
```

Expected: `stack.env` shown as "deleted" in staged changes; `stack.env.example` shown as new untracked file.

- [ ] **Step 5: Stage and commit**

```bash
git add .gitignore stack.env.example
git commit -m "security: replace stack.env with stack.env.example, fix gitignore

- Renamed stack.env → stack.env.example (committed template)
- Fixed variable names to match src/index.ts: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
- Removed !stack.env so real credentials cannot be accidentally committed
- stack.env is now gitignored; copy from stack.env.example for local use"
```

---

### Task 2: Delete `cdp_api_key-test.json`

**Files:**
- Delete: `cdp_api_key-test.json`

- [ ] **Step 1: Confirm the file is not tracked**

```bash
git ls-files cdp_api_key-test.json
```

Expected: empty output (no output means not tracked).

- [ ] **Step 2: Delete the file**

```bash
rm cdp_api_key-test.json
```

- [ ] **Step 3: Verify**

```bash
ls cdp_api_key-test.json 2>&1
```

Expected: `ls: cannot access 'cdp_api_key-test.json': No such file or directory`

No commit needed — file was not tracked.

---

### Task 3: Enforce 1 MB body size limit on `/mcp` POST

**Files:**
- Modify: `src/webServer.ts:52-83`

- [ ] **Step 1: Add `MAX_BODY_BYTES` constant before the try block**

Locate `if (url.pathname === "/mcp") {` (around line 52). Add one line before `try {`:

```typescript
    if (url.pathname === "/mcp") {
      const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
      try {
```

- [ ] **Step 2: Add size tracking inside the body-reading Promise**

Replace the existing Promise block:

```typescript
          const raw = await new Promise<string>((resolve, reject) => {
            let body = "";
            req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
            req.on("end", () => resolve(body));
            req.on("error", reject);
          });
```

With:

```typescript
          let totalBytes = 0;
          const raw = await new Promise<string>((resolve, reject) => {
            let body = "";
            req.on("data", (chunk: Buffer) => {
              totalBytes += chunk.length;
              if (totalBytes > MAX_BODY_BYTES) {
                req.resume(); // drain remaining data so the socket closes cleanly
                reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
                return;
              }
              body += chunk.toString();
            });
            req.on("end", () => resolve(body));
            req.on("error", reject);
          });
```

- [ ] **Step 3: Update the catch block to return 413 for oversized payloads**

Replace:

```typescript
      } catch (err) {
        console.error("[mcp/http] Error handling request:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
```

With:

```typescript
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
        const message = statusCode === 413 ? "Payload too large" : "Internal server error";
        console.error("[mcp/http] Error handling request:", err);
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 5: Manual test — verify 413 for oversized payload** (requires server running: `npm run dev` in a separate terminal)

```bash
python3 -c "import sys; sys.stdout.buffer.write(b'{\"x\":\"' + b'a'*2097152 + b'\"}')" \
  | curl -s -X POST http://localhost:3002/mcp \
    -H "Content-Type: application/json" \
    --data-binary @- -o - -w "\nHTTP %{http_code}\n"
```

Expected: `{"error":"Payload too large"}` followed by `HTTP 413`

- [ ] **Step 6: Commit**

```bash
git add src/webServer.ts
git commit -m "security: enforce 1 MB body size limit on /mcp POST endpoint

Rejects oversized payloads with 413 before they can exhaust server memory."
```

---

## Chunk 2: Code Quality Fixes

Addresses: [HIGH] MCP server-per-request cleanup, [MEDIUM] `readLogs` ring buffer, [MEDIUM] `trimOldLogs` async, [LOW] `NetworkedTool` interface location

---

### Task 4: Fix MCP `Server` per-request cleanup

**Files:**
- Modify: `src/webServer.ts:52-83`

The `Server` type is already imported at the top of `webServer.ts` — no new import needed.

**Depends on Task 3 having been applied first** — the catch block below reflects the post-Task-3 state.

Three precise targeted edits — apply them in order:

- [ ] **Step 1a: Add `let mcpServer` declaration before the `try` block**

Find the exact line (inside the `/mcp` block, after `const MAX_BODY_BYTES = ...`):

```typescript
      const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
      try {
```

Change to:

```typescript
      const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
      let mcpServer: Server | undefined;
      try {
```

- [ ] **Step 1b: Change `const mcpServer = ` to `mcpServer = ` inside the try block**

Find:

```typescript
        const mcpServer = buildMcpServer(tools, toolHandler);
```

Change to:

```typescript
        mcpServer = buildMcpServer(tools, toolHandler);
```

- [ ] **Step 1c: Add `finally` block after the closing `}` of the catch block**

Find (the exact closing of the catch block — after Task 3 this reads):

```typescript
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
      return;
```

Change to:

```typescript
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      } finally {
        await mcpServer?.close().catch(() => {});
      }
      return;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/webServer.ts
git commit -m "fix: close MCP server instance after each HTTP request

Prevents GC pressure and handle leaks from accumulated Server objects
under sustained HTTP load."
```

---

### Task 5: Add in-memory ring buffer to logger

**Files:**
- Modify: `src/logger.ts`

The ring buffer eliminates full file-reads on every `/api/logs` poll. `writeLog()` pushes into the buffer; `readLogs()` serves from it. On cold start (buffer empty), `readLogs()` falls back to the file and warms the buffer.

- [ ] **Step 1: Add ring buffer constants and state after the config block (after line 32)**

After the `})();` closing of `LOG_RETENTION_MS`, add:

```typescript
// ── In-memory ring buffer ─────────────────────────────────────────────────────

const LOG_BUFFER_MAX = 500;
const logBuffer: LogEntry[] = [];
```

- [ ] **Step 2: Update `writeLog()` to also push to the buffer**

Replace (include the inline comment lines — they exist in the actual source):

```typescript
export function writeLog(entry: LogEntry): void {
  const dir = path.dirname(ACTIVITY_LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  // Synchronous: Node.js is single-threaded and tool calls are sequential,
  // so there is no risk of interleaved appends corrupting the JSONL file.
  fs.appendFileSync(ACTIVITY_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
}
```

With:

```typescript
export function writeLog(entry: LogEntry): void {
  const dir = path.dirname(ACTIVITY_LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  // Synchronous: Node.js is single-threaded and tool calls are sequential,
  // so there is no risk of interleaved appends corrupting the JSONL file.
  fs.appendFileSync(ACTIVITY_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  }
}
```

- [ ] **Step 3: Replace `readLogs()` to serve from buffer with file fallback**

Replace the entire `readLogs` function:

```typescript
export function readLogs(limit = 200): LogEntry[] {
  const cap = Math.min(limit, LOG_BUFFER_MAX);

  // Normal runtime path: serve directly from buffer
  if (logBuffer.length > 0) {
    return [...logBuffer].reverse().slice(0, cap);
  }

  // Cold-start fallback: read file, warm buffer, then serve
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];

  const raw = fs.readFileSync(ACTIVITY_LOG_FILE, "utf-8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      logBuffer.push(JSON.parse(line) as LogEntry);
    } catch {
      // skip corrupt lines
    }
  }
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  }

  return [...logBuffer].reverse().slice(0, cap);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts
git commit -m "perf: add in-memory ring buffer to logger

readLogs() now serves from buffer instead of re-reading the full log
file on every 5-second poll. Falls back to file on cold start to warm buffer."
```

---

### Task 6: Make `trimOldLogs()` non-blocking

**Files:**
- Modify: `src/logger.ts`

- [ ] **Step 1: Replace `trimOldLogs()` with a deferred async implementation**

Replace the entire `trimOldLogs` function:

```typescript
export function trimOldLogs(): void {
  setImmediate(() => { void _trimOldLogsAsync(); });
}

async function _trimOldLogsAsync(): Promise<void> {
  try {
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) return;

    const cutoff = Date.now() - LOG_RETENTION_MS;
    const raw = await fs.promises.readFile(ACTIVITY_LOG_FILE, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);

    const kept = lines.filter((line) => {
      try {
        const entry = JSON.parse(line) as LogEntry;
        return new Date(entry.ts).getTime() >= cutoff;
      } catch {
        return false;
      }
    });

    await fs.promises.writeFile(
      ACTIVITY_LOG_FILE,
      kept.join("\n") + (kept.length ? "\n" : ""),
      "utf-8"
    );
    console.error(
      `[log] Trimmed activity log: kept ${kept.length} / ${lines.length} entries (>${Math.round(LOG_RETENTION_MS / 86400000)}d old removed).`
    );
  } catch (err) {
    console.error("[log] trimOldLogs failed:", err);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/logger.ts
git commit -m "perf: make trimOldLogs() non-blocking

Deferred via setImmediate + async fs.promises so the MCP server connects
before the log trim runs on startup."
```

---

### Task 7: Move `NetworkedTool` interface to top-level types

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add `NetworkedTool` to the top-level types section**

The types section at `src/index.ts:41-43` currently reads:

```typescript
// ── Types ─────────────────────────────────────────────────────────────────────

type RawToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;
```

Add `NetworkedTool` immediately after:

```typescript
// ── Types ─────────────────────────────────────────────────────────────────────

type RawToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

interface NetworkedTool {
  schema: Tool;
  handlers: Map<string, RawToolHandler>;
}
```

- [ ] **Step 2: Remove the inline interface from `main()`**

Locate and delete these 4 lines inside `main()` (around line 120):

```typescript
  interface NetworkedTool {
    schema: Tool;
    handlers: Map<string, RawToolHandler>;
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "refactor: move NetworkedTool interface to top-level types section"
```

---

## Chunk 3: UI/UX Improvements

Addresses: [MEDIUM] Pause button state, [MEDIUM] `loadTools` refresh, [MEDIUM] tool search, [LOW] `/api/status` endpoint, [LOW] Online pill, [LOW] log row expand, [LOW] responsive layout

All changes in this chunk are in `src/webServer.ts` unless noted.

---

### Task 8: Fix Pause button initial active state

**Files:**
- Modify: `src/webServer.ts` (`buildHtml()`)

- [ ] **Step 1: Remove `class="active"` from the Pause button's initial HTML**

Find in `buildHtml()`:

```html
          <button id="btn-pause" class="active">Pause</button>
```

Change to:

```html
          <button id="btn-pause">Pause</button>
```

- [ ] **Step 2: Invert the toggle logic in the click handler**

Find in the `<script>` section:

```javascript
    document.getElementById('btn-pause').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? 'Resume' : 'Pause';
      this.classList.toggle('active', !paused);
    });
```

Change `!paused` to `paused`:

```javascript
    document.getElementById('btn-pause').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? 'Resume' : 'Pause';
      this.classList.toggle('active', paused);
    });
```

Expected states after fix:
- **Running** (`paused=false`): label "Pause", no blue highlight
- **Paused** (`paused=true`): label "Resume", blue highlight (accent) signals the paused mode is active

- [ ] **Step 3: Build and verify manually**

```bash
npm run build
```

Open http://localhost:3002. Verify:
- On page load: Pause button has no blue highlight
- After clicking: turns blue, label changes to "Resume"
- After clicking again: loses blue, label changes back to "Pause"

- [ ] **Step 4: Commit**

```bash
git add src/webServer.ts
git commit -m "fix: correct Pause button active state

Highlights only when paused (Resume state), not when live updates are running."
```

---

### Task 9: Add `loadTools` to the polling interval

**Files:**
- Modify: `src/webServer.ts` (`buildHtml()`)

- [ ] **Step 1: Add `loadTools` to the init interval**

Find in the `// ── Init` section of the script:

```javascript
    loadTools();
    pollLogs();
    setInterval(pollLogs, ${POLL_MS});
```

Change to:

```javascript
    loadTools();
    pollLogs();
    setInterval(pollLogs, ${POLL_MS});
    setInterval(loadTools, 30000); // refresh tool list every 30 s
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/webServer.ts
git commit -m "fix: refresh tool list every 30s in web UI

Prevents stale tools panel when server restarts with an open browser tab."
```

---

### Task 10: Add real-time tool search/filter

**Files:**
- Modify: `src/webServer.ts` (`buildHtml()`)

- [ ] **Step 1: Add CSS for the search input**

In the `<style>` block, after the `.panel-head-meta` rule block, add:

```css
    .tool-search {
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text);
      outline: none;
      width: 140px;
      transition: border-color 0.12s;
    }
    .tool-search:focus { border-color: var(--accent); }
    .tool-search::placeholder { color: var(--muted); }
```

- [ ] **Step 2: Replace the tools panel header to include the search input**

Find:

```html
      <div class="panel-head">
        <span class="panel-head-label">Available Tools</span>
        <span class="panel-head-meta">Click to expand schema</span>
      </div>
```

Change to:

```html
      <div class="panel-head">
        <span class="panel-head-label">Available Tools</span>
        <input id="tool-search" class="tool-search" type="search" placeholder="Filter tools…" autocomplete="off">
      </div>
```

- [ ] **Step 3: Add filter logic in the `// ── Controls` section of the script**

After the `btn-clear` event listener, add:

```javascript
    document.getElementById('tool-search').addEventListener('input', function () {
      var q = this.value.toLowerCase();
      document.querySelectorAll('#tools-list .tool-card').forEach(function (card) {
        var name = card.querySelector('.tool-name').textContent.toLowerCase();
        var desc = card.querySelector('.tool-desc').textContent.toLowerCase();
        card.style.display = (name.includes(q) || desc.includes(q)) ? '' : 'none';
      });
    });
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Open http://localhost:3002. Type in the search box — cards filter in real time. Clearing the input restores all cards.

- [ ] **Step 5: Commit**

```bash
git add src/webServer.ts
git commit -m "feat: add real-time tool search/filter to web UI"
```

---

### Task 11: Add `/api/status` endpoint and wallet info to header

**Files:**
- Modify: `src/webServer.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add `ServerStatus` interface in `src/webServer.ts`**

After `type ToolHandler = ...` at the top of `webServer.ts`, add:

```typescript
interface ServerStatus {
  address: string;
  networks: string[];
  startedAt: Date;
}
```

- [ ] **Step 2: Update `startWebServer` signature to accept `status`**

Change:

```typescript
export function startWebServer(tools: Tool[], toolHandler: ToolHandler): http.Server {
```

To:

```typescript
export function startWebServer(tools: Tool[], toolHandler: ToolHandler, status: ServerStatus): http.Server {
```

- [ ] **Step 3: Add `/api/status` route in the switch block**

In the `switch (url.pathname)` block, add before `default:`:

```typescript
      case "/api/status":
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({
          address: status.address,
          networks: status.networks,
          toolCount: tools.length,
          uptimeMs: Date.now() - status.startedAt.getTime(),
        }));
        break;
```

- [ ] **Step 4: Update `src/index.ts` to collect `primaryAddress` and pass `status`**

In `main()`, add `let primaryAddress = "";` before the network initialization loop:

```typescript
  let primaryAddress = "";
  for (const networkId of networks) {
```

Inside the loop, after `const { tools, toolHandler, address } = await initNetwork(...)`, add:

```typescript
    if (!primaryAddress) primaryAddress = address;
```

Update the `startWebServer` call:

```typescript
  // Before:
  startWebServer(allTools, loggingToolHandler);

  // After:
  startWebServer(allTools, loggingToolHandler, {
    address: primaryAddress,
    networks,
    startedAt: new Date(),
  });
```

- [ ] **Step 5: Add header badges for address and network in `buildHtml()`**

Find the `<header>` section. The area around the existing `tool-count` badge:

```html
    <span class="header-badge" id="tool-count">–</span>

    <div class="header-right">
      <div class="status-pill"><span class="dot"></span>Online</div>
      <span id="header-meta">–</span>
    </div>
```

Change to:

```html
    <span class="header-badge" id="tool-count">–</span>
    <span class="header-badge" id="network-badge" style="display:none">–</span>
    <span class="header-badge" id="address-badge"
      style="display:none;font-family:var(--mono);cursor:pointer"
      title="Click to copy wallet address">–</span>

    <div class="header-right">
      <div class="status-pill" id="status-pill"><span class="dot"></span>Online</div>
      <span id="header-meta">–</span>
    </div>
```

- [ ] **Step 6: Update `loadTools()` in the script to fetch `/api/status` and populate badges**

Replace the first two lines of `loadTools()`:

```javascript
    async function loadTools() {
      try {
        const tools = await fetch('/api/tools').then(r => r.json());
        document.getElementById('tool-count').textContent = tools.length + ' tools';
        document.getElementById('header-meta').textContent = new Date().toLocaleTimeString();
```

With:

```javascript
    async function loadTools() {
      try {
        const [tools, status] = await Promise.all([
          fetch('/api/tools').then(r => r.json()),
          fetch('/api/status').then(r => r.json()).catch(function() { return null; }),
        ]);
        document.getElementById('tool-count').textContent = tools.length + ' tools';
        document.getElementById('header-meta').textContent = new Date().toLocaleTimeString();

        var netBadge = document.getElementById('network-badge');
        var addrBadge = document.getElementById('address-badge');
        var pill = document.getElementById('status-pill');
        if (status) {
          netBadge.textContent = status.networks.join(', ');
          netBadge.style.display = '';
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
          pill.className = 'status-pill';
          pill.innerHTML = '<span class="dot"></span>Online';
        } else {
          netBadge.style.display = 'none';
          addrBadge.style.display = 'none';
          pill.className = 'status-pill degraded';
          pill.innerHTML = '<span class="dot"></span>Degraded';
        }
```

The rest of `loadTools()` (the tools list rendering) is unchanged — this block runs before it.

- [ ] **Step 7: Add degraded pill CSS**

In the `<style>` block, after the `.status-pill .dot` rule, add:

```css
    .status-pill.degraded {
      background: var(--amber-lt);
      color: var(--amber);
    }
    .status-pill.degraded .dot { background: var(--amber); animation: none; }
```

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 9: Verify manually**

```bash
curl -s http://localhost:3002/api/status | python3 -m json.tool
```

Expected output:
```json
{
    "address": "0x...",
    "networks": ["base-sepolia"],
    "toolCount": 17,
    "uptimeMs": 12345
}
```

Open http://localhost:3002 and verify: network name badge and truncated wallet address appear in the header. Clicking the address copies it. Status pill shows green "Online".

- [ ] **Step 10: Commit**

```bash
git add src/webServer.ts src/index.ts
git commit -m "feat: add /api/status endpoint and wallet info to UI header

Exposes address, networks, toolCount, and uptime via /api/status.
Header shows network badge and truncated wallet address with copy-on-click.
Status pill turns amber 'Degraded' when /api/status is unreachable."
```

---

### Task 12: Make log rows expandable

**Files:**
- Modify: `src/webServer.ts` (`buildHtml()`)

- [ ] **Step 1: Add CSS for expandable log entries**

In the `<style>` block, after the `.log-msg` rule, add:

```css
    .log-entry { }
    .log-detail {
      display: none;
      font-family: var(--mono);
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0 0 6px 6px;
      padding: 6px 10px;
      margin: 0 6px 6px;
      color: var(--muted);
      max-height: 300px;
      overflow-y: auto;
    }
    .log-entry.expanded .log-detail { display: block; }
    .log-entry.expanded .log-row { background: var(--surface); border-radius: 6px 6px 0 0; }
    .log-entry.expanded .log-msg { white-space: normal; overflow: visible; text-overflow: clip; }
    .log-row.clickable { cursor: pointer; }
```

- [ ] **Step 2: Add click-delegation listener in the `// ── Controls` section**

After the `btn-clear` listener (and after the tool-search listener from Task 10), add:

```javascript
    document.getElementById('log-list').addEventListener('click', function (e) {
      var row = e.target.closest('.log-row.clickable');
      if (row) row.closest('.log-entry').classList.toggle('expanded');
    });
```

- [ ] **Step 3: Update the log row template in `pollLogs()`**

Replace the `el.innerHTML = entries.map(e => {` block:

```javascript
        el.innerHTML = entries.map(e => {
          const ts = new Date(e.ts).toLocaleString(undefined, {
            month:'2-digit', day:'2-digit',
            hour:'2-digit', minute:'2-digit', second:'2-digit',
          });
          const cls = EV_CLASS[e.event] || '';
          return \`<div class="log-row">
            <span class="log-ts">\${esc(ts)}</span>
            <span class="log-ev"><span class="ev-pill \${cls}">\${esc(e.event)}</span></span>
            <span class="log-msg" title="\${esc(e.message)}">\${esc(e.message)}</span>
          </div>\`;
        }).join('');
```

With:

```javascript
        el.innerHTML = entries.map(e => {
          const ts = new Date(e.ts).toLocaleString(undefined, {
            month:'2-digit', day:'2-digit',
            hour:'2-digit', minute:'2-digit', second:'2-digit',
          });
          const cls = EV_CLASS[e.event] || '';
          const hasDetail = e.data && Object.keys(e.data).length > 0;
          const detailHtml = hasDetail
            ? '<pre class="log-detail">' + esc(JSON.stringify(e.data, null, 2)) + '</pre>'
            : '';
          return \`<div class="log-entry">
            <div class="log-row \${hasDetail ? 'clickable' : ''}">
              <span class="log-ts">\${esc(ts)}</span>
              <span class="log-ev"><span class="ev-pill \${cls}">\${esc(e.event)}</span></span>
              <span class="log-msg">\${esc(e.message)}</span>
            </div>
            \${detailHtml}
          </div>\`;
        }).join('');
```

Note: `detailHtml` uses string concatenation (not nested backticks) to avoid template literal escaping issues inside `buildHtml()`'s outer template literal.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 5: Verify manually**

Open http://localhost:3002. Log rows with `data` (boot entries, tool calls) should show a pointer cursor and expand on click to reveal formatted JSON. Rows without data are non-interactive.

- [ ] **Step 6: Commit**

```bash
git add src/webServer.ts
git commit -m "feat: make log rows expandable to show full message and data payload

Rows with data field show a pointer cursor and expand on click to
reveal formatted JSON. Rows without data are non-interactive."
```

---

### Task 13: Fix responsive layout

**Files:**
- Modify: `src/webServer.ts` (`buildHtml()`)

- [ ] **Step 1: Update the grid column definition**

Find in the `<style>` block:

```css
    main {
      display: grid;
      grid-template-columns: 320px 1fr;
      flex: 1;
      overflow: hidden;
    }
```

Change `320px 1fr` to `minmax(240px, 320px) 1fr`:

```css
    main {
      display: grid;
      grid-template-columns: minmax(240px, 320px) 1fr;
      flex: 1;
      overflow: hidden;
    }
```

- [ ] **Step 2: Add responsive breakpoint**

Immediately after the closing `}` of the `main` rule, add:

```css
    @media (max-width: 640px) {
      main { grid-template-columns: 1fr; }
      .panel + .panel { border-left: none; border-top: 1px solid var(--border); }
    }
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Verify**

Open http://localhost:3002. In browser DevTools, set viewport to 400px wide — panels should stack vertically (tools on top, log below). At full desktop width, layout should be unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/webServer.ts
git commit -m "fix: responsive layout for narrow viewports

Panels stack vertically below 640px. Left column uses minmax(240px, 320px)."
```

---

## Summary

| Chunk | Tasks | Findings Addressed |
|-------|-------|--------------------|
| 1 | 1–3 | [CRITICAL] `stack.env`, [HIGH] body size limit, [LOW] `cdp_api_key-test.json` |
| 2 | 4–7 | [HIGH] MCP server cleanup, [MEDIUM] ring buffer, [MEDIUM] `trimOldLogs` async, [LOW] `NetworkedTool` interface |
| 3 | 8–13 | [MEDIUM] pause button, [MEDIUM] `loadTools` refresh, [MEDIUM] tool search, [LOW] `/api/status` + Online pill (combined), [LOW] log expand, [LOW] responsive layout |

All 14 findings from the [comprehensive review spec](../specs/2026-03-12-comprehensive-review.md) are addressed.
