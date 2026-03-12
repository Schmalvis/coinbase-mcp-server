# Web UI & Activity Log

## Accessing the UI

When the server is running, open:

```
http://localhost:3002
```

Replace `localhost` with your server's IP when accessing a remote deployment.

## Panels

**Available Tools** (left panel)
- Lists all AgentKit tools with name and description
- Click any card to expand its full JSON input schema

**Activity Log** (right panel)
- Rolling log of all server events, most recent at top
- Auto-refreshes every 5 seconds
- **Pause** — freeze the display for inspection
- **Clear view** — reset the display (log file on disk is unaffected)

## Log Event Types

| Event | Colour | Description |
|-------|--------|-------------|
| `boot` | Blue | Server startup events |
| `server_ready` | Green | MCP server fully initialised |
| `tool_call` | Amber | A tool was invoked by the AI |
| `tool_result` | Green | Tool completed successfully |
| `tool_error` | Red | Tool call failed |
| `fatal` | Red | Unhandled startup error |

## Log Persistence

Activity is written to `/app/data/activity.log` inside the Docker volume — it survives container restarts and redeployments.

The log is JSONL format (one JSON object per line):

```json
{"ts":"2026-03-01T14:23:01.000Z","level":"info","event":"tool_call","message":"Tool called: get_balance","data":{"tool":"get_balance","args":{"tokenAddress":"0x..."},"network":"base-sepolia"}}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3002` | Port the UI listens on |
| `LOG_RETENTION_DAYS` | `30` | Days to keep log entries — older entries are purged on startup |
