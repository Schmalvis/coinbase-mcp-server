# Development

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 or higher |
| npm | bundled with Node.js |
| Docker | any recent version (optional) |

## Running Locally

```bash
cp .env.example .env   # fill in CDP credentials
npm install

# Development — runs via tsx with no compile step
npm run dev

# Production — compile first, then run
npm run build
npm start
```

On successful startup you'll see something like:

```
[boot] Configuring CdpEvmWalletProvider on base-sepolia
[boot] Wallet address (base-sepolia): 0xABC...
[boot] Loaded 38 tool(s) for base-sepolia.
[mcp]  Stdio transport ready.
[web]  UI available at http://localhost:3002
```

## Mock UI Test

Runs the web server with mock tools and seeded log entries — no CDP credentials required. Useful for iterating on the UI.

```bash
npm run test:ui
```

Then open [http://localhost:3002](http://localhost:3002).

## Project Structure

```
coinbase-mcp-server/
├── src/
│   ├── index.ts          ← Entry point — wallet, AgentKit, MCP + web server wiring
│   ├── logger.ts         ← Activity log (JSONL, configurable retention)
│   └── webServer.ts      ← HTTP monitoring UI + /mcp HTTP transport (port 3002)
├── scripts/
│   └── test-ui.ts        ← Mock UI test runner
├── docs/                 ← This documentation
├── .github/workflows/
│   └── docker-publish.yml ← CI: builds and pushes image on push to main
├── .env.example          ← Template for local credentials (copy to .env)
├── docker-compose.yml
├── Dockerfile
├── package.json
└── tsconfig.json
```

## TypeScript

The project uses `"module": "NodeNext"` — all local imports require the `.js` extension even though the source files are `.ts`. Follow the pattern in existing files.

```bash
npm run build   # tsc — outputs to dist/
```
