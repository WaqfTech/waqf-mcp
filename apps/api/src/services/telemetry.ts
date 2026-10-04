import { createDb, mcpLogs, type NewMcpLog } from "@waqf/db";

export interface AggregatedMetrics {
  timeWindowHours: number;
  since: string;
  totalRequests: number;
  cacheHits: number;
  cacheHitRatio: number;
  avgLatencyMs: number;
  errorCount: number;
  errorRate: number;
  topTools: Array<{ toolName: string; count: number; avgLatencyMs: number }>;
  clientApps: Array<{ clientApp: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

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

  public async getAggregatedMetrics(timeWindowHours = 24): Promise<AggregatedMetrics> {
    const since = new Date(Date.now() - timeWindowHours * 3600 * 1000).toISOString();

    const summaryStmt = this.d1.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ?
    `).bind(since);

    const toolsStmt = this.d1.prepare(`
      SELECT 
        tool_name, 
        COUNT(*) as count, 
        AVG(latency_ms) as avg_latency_ms 
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ? AND tool_name IS NOT NULL 
      GROUP BY tool_name 
      ORDER BY count DESC 
      LIMIT 10
    `).bind(since);

    const clientAppsStmt = this.d1.prepare(`
      SELECT 
        client_app, 
        COUNT(*) as count 
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ? AND client_app IS NOT NULL 
      GROUP BY client_app 
      ORDER BY count DESC
    `).bind(since);

    const countriesStmt = this.d1.prepare(`
      SELECT 
        country, 
        COUNT(*) as count 
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ? AND country IS NOT NULL 
      GROUP BY country 
      ORDER BY count DESC 
      LIMIT 10
    `).bind(since);

    const [summaryRes, toolsRes, clientAppsRes, countriesRes] = await this.d1.batch([
      summaryStmt,
      toolsStmt,
      clientAppsStmt,
      countriesStmt,
    ]);

    const summaryRow = (summaryRes.results?.[0] as Record<string, unknown>) ?? {};
    const totalRequests = Number(summaryRow.total_requests ?? 0);
    const cacheHits = Number(summaryRow.cache_hits ?? 0);
    const avgLatencyMs = Math.round(Number(summaryRow.avg_latency_ms ?? 0) * 100) / 100;
    const errorCount = Number(summaryRow.error_count ?? 0);

    const cacheHitRatio = totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 1000) / 1000 : 0;
    const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 1000) / 1000 : 0;

    const topTools = ((toolsRes.results as Array<Record<string, unknown>>) ?? []).map((row) => ({
      toolName: String(row.tool_name ?? ""),
      count: Number(row.count ?? 0),
      avgLatencyMs: Math.round(Number(row.avg_latency_ms ?? 0) * 100) / 100,
    }));

    const clientApps = ((clientAppsRes.results as Array<Record<string, unknown>>) ?? []).map((row) => ({
      clientApp: String(row.client_app ?? ""),
      count: Number(row.count ?? 0),
    }));

    const topCountries = ((countriesRes.results as Array<Record<string, unknown>>) ?? []).map((row) => ({
      country: String(row.country ?? ""),
      count: Number(row.count ?? 0),
    }));

    return {
      timeWindowHours,
      since,
      totalRequests,
      cacheHits,
      cacheHitRatio,
      avgLatencyMs,
      errorCount,
      errorRate,
      topTools,
      clientApps,
      topCountries,
    };
  }
}
