import * as fs from "fs";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";
export type LogEvent =
  | "boot"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "server_ready"
  | "fatal";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: LogEvent;
  message: string;
  data?: Record<string, unknown>;
}

// ── Config ────────────────────────────────────────────────────────────────────

const ACTIVITY_LOG_FILE =
  process.env.ACTIVITY_LOG_FILE ?? "/app/data/activity.log";

const LOG_RETENTION_MS: number = (() => {
  const days = parseInt(process.env.LOG_RETENTION_DAYS ?? "30", 10);
  const safe = Number.isFinite(days) && days > 0 ? days : 30;
  return safe * 24 * 60 * 60 * 1000;
})();

// ── Core I/O ──────────────────────────────────────────────────────────────────

export function writeLog(entry: LogEntry): void {
  const dir = path.dirname(ACTIVITY_LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  // Synchronous: Node.js is single-threaded and tool calls are sequential,
  // so there is no risk of interleaved appends corrupting the JSONL file.
  fs.appendFileSync(ACTIVITY_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

export function readLogs(limit = 200): LogEntry[] {
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];

  const raw = fs.readFileSync(ACTIVITY_LOG_FILE, "utf-8");
  const entries: LogEntry[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LogEntry);
    } catch {
      // skip corrupt lines
    }
  }

  return entries.reverse().slice(0, limit);
}

export function trimOldLogs(): void {
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return;

  const cutoff = Date.now() - LOG_RETENTION_MS;
  const raw = fs.readFileSync(ACTIVITY_LOG_FILE, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  const kept = lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as LogEntry;
      return new Date(entry.ts).getTime() >= cutoff;
    } catch {
      return false;
    }
  });

  fs.writeFileSync(
    ACTIVITY_LOG_FILE,
    kept.join("\n") + (kept.length ? "\n" : ""),
    "utf-8"
  );
  console.error(
    `[log] Trimmed activity log: kept ${kept.length} / ${lines.length} entries (>${Math.round(LOG_RETENTION_MS / 86400000)}d old removed).`
  );
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export function logBoot(message: string, data?: Record<string, unknown>): void {
  writeLog({ ts: new Date().toISOString(), level: "info", event: "boot", message, data });
}

export function logToolCall(name: string, args: Record<string, unknown>): void {
  writeLog({
    ts: new Date().toISOString(),
    level: "info",
    event: "tool_call",
    message: `Tool called: ${name}`,
    data: { tool: name, args: summarizeArgs(args) },
  });
}

export function logToolResult(
  name: string,
  success: boolean,
  durationMs: number
): void {
  writeLog({
    ts: new Date().toISOString(),
    level: success ? "info" : "warn",
    event: success ? "tool_result" : "tool_error",
    message: `Tool ${success ? "succeeded" : "failed"}: ${name} (${durationMs}ms)`,
    data: { tool: name, success, durationMs },
  });
}

export function logFatal(message: string, err: unknown): void {
  writeLog({
    ts: new Date().toISOString(),
    level: "error",
    event: "fatal",
    message,
    data: { error: String(err) },
  });
}

// ── Internals ─────────────────────────────────────────────────────────────────

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const MAX = 120;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && v.length > MAX) {
      out[k] = v.slice(0, MAX) + "…";
    } else if (typeof v === "object" && v !== null) {
      out[k] = "[object]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
