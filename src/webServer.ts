import * as http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readLogs } from "./logger.js";

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

// ── MCP server factory (one per HTTP request in stateless mode) ───────────────

function buildMcpServer(tools: Tool[], toolHandler: ToolHandler): Server {
  const server = new Server(
    { name: "coinbase-agentkit-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toolHandler(name, (args ?? {}) as Record<string, unknown>) as any;
  });

  return server;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startWebServer(tools: Tool[], toolHandler: ToolHandler): http.Server {
  const port = parseInt(process.env.WEB_PORT ?? "3002", 10);

  const server = http.createServer(async (req, res) => {
    // CORS — allow any origin (LAN use)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // ── MCP Streamable HTTP transport ────────────────────────────────────────
    if (url.pathname === "/mcp") {
      const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
      let mcpServer: Server | undefined;
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless — no session tracking needed
        });

        mcpServer = buildMcpServer(tools, toolHandler);
        await mcpServer.connect(transport);

        // For POST: read and parse the JSON body before handing off
        if (req.method === "POST") {
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
          let parsedBody: unknown;
          try { parsedBody = JSON.parse(raw); } catch { /* let transport reject */ }
          await transport.handleRequest(req, res, parsedBody);
        } else {
          await transport.handleRequest(req, res);
        }
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
        const message = statusCode === 413 ? "Payload too large" : "Internal server error";
        console.error("[mcp/http] Error handling request:", err);
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      } finally {
        await mcpServer?.close().catch(() => {});
      }
      return;
    }

    // ── Web UI routes ────────────────────────────────────────────────────────
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    switch (url.pathname) {
      case "/":
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(buildHtml());
        break;

      case "/api/tools":
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify(
            tools.map((t) => ({
              name: t.name,
              description: t.description ?? "",
              inputSchema: t.inputSchema,
            }))
          )
        );
        break;

      case "/api/logs": {
        const raw = parseInt(url.searchParams.get("limit") ?? "200", 10);
        const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 200, 500);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(readLogs(limit)));
        break;
      }

      default:
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[web] Port ${port} already in use – web UI disabled.`);
    } else {
      console.error("[web] HTTP server error:", err);
    }
  });

  server.listen(port, () => {
    console.error(`[web] UI available at http://localhost:${port}`);
    console.error(`[mcp] HTTP transport available at http://localhost:${port}/mcp`);
  });

  return server;
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function buildHtml(): string {
  const POLL_MS = 5000;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coinbase AgentKit MCP</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230052FF'/%3E%3Ctext x='16' y='13' font-family='system-ui,sans-serif' font-size='7.5' font-weight='700' fill='white' text-anchor='middle' letter-spacing='0.3'%3EAGENT%3C/text%3E%3Ctext x='16' y='23' font-family='system-ui,sans-serif' font-size='9' font-weight='800' fill='white' text-anchor='middle' letter-spacing='1'%3EMCP%3C/text%3E%3C/svg%3E">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #FFFFFF;
      --surface:   #F5F7FA;
      --surface2:  #EEF1F6;
      --border:    #E2E8F0;
      --text:      #0A0B0D;
      --muted:     #68738D;
      --accent:    #0052FF;
      --accent-lt: #EBF0FF;
      --green:     #00A86B;
      --green-lt:  #E6F7F2;
      --amber:     #C87000;
      --amber-lt:  #FEF3E2;
      --red:       #D93025;
      --red-lt:    #FDEEEC;
      --radius:    8px;
      --mono:      ui-monospace, "Cascadia Code", "Fira Code", monospace;
      --shadow:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    header {
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .cb-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    /* Coinbase wordmark "C" as SVG inline */
    .cb-logo svg { flex-shrink: 0; }

    header h1 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .header-divider {
      width: 1px; height: 20px;
      background: var(--border);
    }

    .header-badge {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 2px 9px;
    }

    .header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--green-lt);
      color: var(--green);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-pill .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--green);
      animation: pulse 2.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    /* ── Two-column layout ── */
    main {
      display: grid;
      grid-template-columns: 320px 1fr;
      flex: 1;
      overflow: hidden;
    }

    /* ── Shared panel ── */
    .panel { display: flex; flex-direction: column; overflow: hidden; }
    .panel + .panel { border-left: 1px solid var(--border); }

    .panel-head {
      padding: 12px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .panel-head-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .panel-head-meta {
      font-size: 11px;
      color: var(--muted);
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      background: var(--bg);
    }

    /* ── Tool cards ── */
    .tool-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.12s, box-shadow 0.12s;
      box-shadow: var(--shadow);
    }
    .tool-card:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-lt);
    }
    .tool-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .tool-name {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
    }
    .tool-chevron {
      color: var(--muted);
      font-size: 10px;
      flex-shrink: 0;
      margin-top: 2px;
      transition: transform 0.15s;
    }
    .tool-card.expanded .tool-chevron { transform: rotate(90deg); }
    .tool-desc {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
      line-height: 1.45;
    }
    .tool-schema {
      display: none;
      margin-top: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--muted);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }
    .tool-card.expanded .tool-schema { display: block; }

    /* ── Log ── */
    .log-controls { display: flex; gap: 6px; align-items: center; }
    .log-controls button {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 10px;
      transition: border-color 0.12s, color 0.12s, background 0.12s;
    }
    .log-controls button:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-lt);
    }
    .log-controls button.active {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-lt);
    }

    .log-row {
      display: grid;
      grid-template-columns: 160px 100px 1fr;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 12px;
      transition: background 0.08s;
    }
    .log-row:hover { background: var(--surface); }
    .log-ts  { color: var(--muted); white-space: nowrap; }
    .log-ev  { font-weight: 600; white-space: nowrap; }
    .log-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }

    /* Event badges */
    .ev-pill {
      display: inline-block;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ev-boot         { background: var(--accent-lt); color: var(--accent); }
    .ev-server_ready { background: var(--green-lt);  color: var(--green); }
    .ev-tool_call    { background: var(--amber-lt);  color: var(--amber); }
    .ev-tool_result  { background: var(--green-lt);  color: var(--green); }
    .ev-tool_error   { background: var(--red-lt);    color: var(--red); }
    .ev-fatal        { background: var(--red-lt);    color: var(--red); }

    .empty {
      color: var(--muted);
      text-align: center;
      padding: 48px 0;
      font-size: 13px;
    }

    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <!-- Coinbase "C" logo mark -->
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="14" fill="#0052FF"/>
      <path d="M14 6.5C9.86 6.5 6.5 9.86 6.5 14C6.5 18.14 9.86 21.5 14 21.5C17.57 21.5 20.57 19.2 21.56 16H17.84C17.02 17.47 15.62 18.5 14 18.5C11.52 18.5 9.5 16.48 9.5 14C9.5 11.52 11.52 9.5 14 9.5C15.62 9.5 17.02 10.53 17.84 12H21.56C20.57 8.8 17.57 6.5 14 6.5Z" fill="white"/>
    </svg>

    <h1>AgentKit MCP Server</h1>
    <div class="header-divider"></div>
    <span class="header-badge" id="tool-count">–</span>

    <div class="header-right">
      <div class="status-pill"><span class="dot"></span>Online</div>
      <span id="header-meta">–</span>
    </div>
  </header>

  <main>
    <!-- Tools panel -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-head-label">Available Tools</span>
        <span class="panel-head-meta">Click to expand schema</span>
      </div>
      <div class="panel-body" id="tools-list">
        <div class="empty">Loading tools…</div>
      </div>
    </div>

    <!-- Log panel -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-head-label">Activity Log</span>
        <div class="log-controls">
          <button id="btn-pause">Pause</button>
          <button id="btn-clear">Clear view</button>
        </div>
      </div>
      <div class="panel-body" id="log-list">
        <div class="empty">No activity yet.</div>
      </div>
    </div>
  </main>

  <script>
    let paused = false;
    let lastCount = 0;

    // ── Tools ──────────────────────────────────────────────────────────────────
    async function loadTools() {
      try {
        const tools = await fetch('/api/tools').then(r => r.json());
        document.getElementById('tool-count').textContent = tools.length + ' tools';
        document.getElementById('header-meta').textContent = new Date().toLocaleTimeString();

        const el = document.getElementById('tools-list');
        if (!tools.length) { el.innerHTML = '<div class="empty">No tools loaded.</div>'; return; }

        el.innerHTML = tools.map(t => \`
          <div class="tool-card" onclick="this.classList.toggle('expanded')">
            <div class="tool-card-top">
              <div class="tool-name">\${esc(t.name)}</div>
              <span class="tool-chevron">&#9654;</span>
            </div>
            <div class="tool-desc">\${esc(t.description || '–')}</div>
            <pre class="tool-schema">\${esc(JSON.stringify(t.inputSchema, null, 2))}</pre>
          </div>\`).join('');
      } catch (e) { console.error('tools fetch failed', e); }
    }

    // ── Log ────────────────────────────────────────────────────────────────────
    const EV_CLASS = {
      boot: 'ev-boot', server_ready: 'ev-server_ready',
      tool_call: 'ev-tool_call', tool_result: 'ev-tool_result',
      tool_error: 'ev-tool_error', fatal: 'ev-fatal',
    };

    async function pollLogs() {
      if (paused) return;
      try {
        const entries = await fetch('/api/logs?limit=200').then(r => r.json());
        if (entries.length === lastCount) return;
        lastCount = entries.length;

        const el = document.getElementById('log-list');
        if (!entries.length) { el.innerHTML = '<div class="empty">No activity yet.</div>'; return; }

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
      } catch (e) { console.error('log fetch failed', e); }
    }

    // ── Controls ───────────────────────────────────────────────────────────────
    document.getElementById('btn-pause').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? 'Resume' : 'Pause';
      this.classList.toggle('active', paused);
    });
    document.getElementById('btn-clear').addEventListener('click', function () {
      document.getElementById('log-list').innerHTML =
        '<div class="empty">View cleared — log is still persisted on disk.</div>';
      lastCount = -1;
    });

    // ── Utils ──────────────────────────────────────────────────────────────────
    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    loadTools();
    pollLogs();
    setInterval(pollLogs, ${POLL_MS});
    setInterval(loadTools, 30000); // refresh tool list every 30 s
  </script>
</body>
</html>`;
}
