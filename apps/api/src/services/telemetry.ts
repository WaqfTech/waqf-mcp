import { createDb, mcpLogs, type NewMcpLog } from "@waqf/db";

export class D1TelemetryService {
  constructor(
    private d1: D1Database,
    private salt = "waqf-telemetry-salt-2026"
  ) {}

  public async hashIp(ip: string): Promise<string> {
    const raw = `${this.salt}:${ip}`;
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  public detectClientApp(userAgent: string | null): string {
    if (!userAgent) return "unknown";
    const lower = userAgent.toLowerCase();
    if (lower.includes("claude")) return "claude";
    if (lower.includes("cursor")) return "cursor";
    if (lower.includes("antigravity") || lower.includes("gemini")) return "antigravity";
    if (lower.includes("cline") || lower.includes("roo")) return "cline";
    if (lower.includes("continue")) return "continue";
    if (lower.includes("python")) return "python-sdk";
    if (lower.includes("curl")) return "curl";
    return "other";
  }

  public async log(record: NewMcpLog): Promise<void> {
    try {
      const db = createDb(this.d1);
      await db.insert(mcpLogs).values(record);
    } catch (err) {
      console.warn("Failed to write MCP telemetry log to D1:", err);
    }
  }
}
