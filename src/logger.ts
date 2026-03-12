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

// ── In-memory ring buffer ─────────────────────────────────────────────────────

const LOG_BUFFER_MAX = 500;
const logBuffer: LogEntry[] = [];

// ── Core I/O ──────────────────────────────────────────────────────────────────

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

export function readLogs(limit = 200): LogEntry[] {
  const cap = Math.min(limit, LOG_BUFFER_MAX);

  // Normal runtime path: serve directly from buffer
  if (logBuffer.length > 0) {
    return [...logBuffer].reverse().slice(0, cap);
  }

  // Cold-start fallback: read file, warm buffer (applying retention filter), then serve
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];

  const cutoff = Date.now() - LOG_RETENTION_MS;
  const raw = fs.readFileSync(ACTIVITY_LOG_FILE, "utf-8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (new Date(entry.ts).getTime() >= cutoff) {
        logBuffer.push(entry);
      }
    } catch {
      // skip corrupt lines
    }
  }
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  }

  return [...logBuffer].reverse().slice(0, cap);
}

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
