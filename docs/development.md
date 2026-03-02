# Development

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 or higher |
| npm | bundled with Node.js |
| Docker | any recent version (optional) |

## Running Locally

```bash
npm install

# Development — runs via tsx with no compile step
npm run dev

# Production — compile first, then run
npm run build
npm start
```

On successful startup:

```
[log]  Trimmed activity log: kept N entries
[boot] Resuming existing wallet from /app/data/wallet_data.json
[boot] Loaded 12 AgentKit tool(s).
[web]  UI available at http://localhost:3002
[mcp]  Server running on stdio – ready for connections.
```

## Mock UI Test

Runs the web server with 12 mock tools and seeded activity log entries — no Coinbase credentials required. Useful for iterating on the UI and verifying the API endpoints.

```bash
npm run test:ui
```

Then open [http://localhost:3002](http://localhost:3002). All 19 API assertions run automatically and results are printed to the terminal. Press `Ctrl+C` to stop (temp log file is cleaned up automatically).

## Project Structure

```
coinbase-mcp-server/
├── src/
│   ├── index.ts          ← Entry point — wallet, AgentKit, MCP + web server wiring
│   ├── logger.ts         ← Activity log (JSONL, configurable retention)
│   └── webServer.ts      ← HTTP monitoring UI (port 3002)
├── scripts/
│   └── test-ui.ts        ← Mock test runner
├── docs/                 ← This documentation
├── .github/workflows/
│   └── docker-publish.yml ← CI: builds linux/arm64 image on push to main
├── stack.env             ← Env config for Docker/Portainer deployment
├── .env.example          ← Template for local credentials
├── docker-compose.yml
├── Dockerfile
├── package.json
└── tsconfig.json
```

## TypeScript

The project uses `"module": "NodeNext"` — all local imports require the `.js` extension even though the source files are `.ts`. This is handled automatically; just follow the pattern in existing files.

```bash
npm run build   # tsc — outputs to dist/
```
