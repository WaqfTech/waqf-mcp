import { createDb, mcpLogs, type NewMcpLog } from "@waqf/db";

/**
 * Telemetry writes are fire-and-forget (ctx.waitUntil), so a failing D1 would
 * otherwise drop every log without a trace. Warn once per isolate, naming the
 * command that fixes a missing local schema.
 */
let warnedTelemetryUnavailable = false;

function warnTelemetryUnavailable(error: unknown): void {
  if (warnedTelemetryUnavailable) {
    return;
  }
  warnedTelemetryUnavailable = true;
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(
    `[telemetry] D1 log write failed — is the local schema applied? Run "aube run db:migrate:local". (${detail})`
  );
}

export interface ErrorBreakdown {
  gatewayFailures: number;
  callerValidationErrors: number;
  upstreamFailures: number;
  noResults: number;
}

export interface AggregatedMetrics {
  timeWindowHours: number;
  since: string;
  totalRequests: number;
  cacheHits: number;
  cacheHitRatio: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorCount: number;
  errorRate: number;
  errorBreakdown: ErrorBreakdown;
  topTools: Array<{ toolName: string; count: number; avgLatencyMs: number }>;
  clientApps: Array<{ clientApp: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.max(0, Math.min(sorted.length - 1, rank));
  return Math.round(sorted[idx] * 100) / 100;
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
    if (lower.includes("openai-mcp") || lower.includes("codex")) return "codex";
    if (lower.includes("claude")) return "claude";
    if (lower.includes("cursor")) return "cursor";
    if (lower.includes("antigravity") || lower.includes("gemini")) return "antigravity";
    if (lower.includes("cline") || lower.includes("roo")) return "cline";
    if (lower.includes("continue")) return "continue";
    if (lower.includes("mistral")) return "mistral";
    if (lower.includes("opencode")) return "opencode";
    if (lower.includes("grok")) return "grok";
    if (lower.includes("wabi")) return "wabi";
    if (lower.includes("mcpregistry")) return "mcp-registry";
    if (lower.includes("google")) return "google";
    if (lower.includes("go-http-client")) return "go-client";
    if (lower.includes("okhttp")) return "okhttp";
    if (lower.includes("undici") || lower === "node") return "node";
    if (
      lower.includes("censys") ||
      lower.includes("agent-index") ||
      lower.includes("mcp-ad-measurement") ||
      lower.includes("mcp-discovery-measurement")
    ) {
      return "crawler";
    }
    if (lower.includes("islamic-mcp-gateway")) return "gateway";
    if (lower.includes("waqfdeploycheck")) return "deploy-check";
    if (lower.includes("python")) return "python-sdk";
    if (lower.includes("curl")) return "curl";
    return "other";
  }

  public async log(record: NewMcpLog): Promise<void> {
    try {
      const db = createDb(this.d1);
      await db.insert(mcpLogs).values(record);
    } catch (err) {
      warnTelemetryUnavailable(err);
    }
  }

  public async getAggregatedMetrics(timeWindowHours = 24): Promise<AggregatedMetrics> {
    const since = new Date(Date.now() - timeWindowHours * 3600 * 1000).toISOString();

    const summaryStmt = this.d1.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN (status_code >= 400 OR error_message IS NOT NULL) AND COALESCE(error_code, '') != 'NO_RESULTS' THEN 1 ELSE 0 END) as error_count
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

    const latenciesStmt = this.d1.prepare(`
      SELECT latency_ms
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ?
      ORDER BY latency_ms ASC
      LIMIT 2000
    `).bind(since);

    const breakdownStmt = this.d1.prepare(`
      SELECT error_code, status_code, COUNT(*) as count
      FROM mcp_logs INDEXED BY idx_mcp_logs_timestamp
      WHERE timestamp >= ? AND (status_code >= 400 OR error_message IS NOT NULL OR error_code IS NOT NULL)
      GROUP BY error_code, status_code
    `).bind(since);

    const batchResults = await this.d1.batch([
      summaryStmt,
      toolsStmt,
      clientAppsStmt,
      countriesStmt,
      latenciesStmt,
      breakdownStmt,
    ]);
    const [summaryRes, toolsRes, clientAppsRes, countriesRes, latenciesRes, breakdownRes] = batchResults;

    const summaryRow = (summaryRes.results?.[0] as Record<string, unknown>) ?? {};
    const totalRequests = Number(summaryRow.total_requests ?? 0);
    const cacheHits = Number(summaryRow.cache_hits ?? 0);
    const avgLatencyMs = Math.round(Number(summaryRow.avg_latency_ms ?? 0) * 100) / 100;
    const errorCount = Number(summaryRow.error_count ?? 0);

    const cacheHitRatio = totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 1000) / 1000 : 0;
    const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 1000) / 1000 : 0;

    const sortedLatencies = ((latenciesRes?.results as Array<Record<string, unknown>>) ?? [])
      .map((row) => Number(row.latency_ms))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const errorBreakdown: ErrorBreakdown = {
      gatewayFailures: 0,
      callerValidationErrors: 0,
      upstreamFailures: 0,
      noResults: 0,
    };
    for (const row of ((breakdownRes?.results as Array<Record<string, unknown>>) ?? [])) {
      const count = Number(row.count ?? 0);
      const code = String(row.error_code ?? "");
      const status = Number(row.status_code ?? 200);
      if (code === "NO_RESULTS") {
        errorBreakdown.noResults += count;
      } else if (code === "INVALID_ARGUMENT" || (status >= 400 && status < 500 && !code)) {
        errorBreakdown.callerValidationErrors += count;
      } else if (
        code === "SOURCE_UNAVAILABLE" ||
        code === "UPSTREAM_TIMEOUT" ||
        code === "RATE_LIMITED" ||
        code === "SOURCE_NOT_FOUND" ||
        code === "SCHEMA_INVALID" ||
        code === "PARTIAL_RESULTS"
      ) {
        errorBreakdown.upstreamFailures += count;
      } else if (code === "INTERNAL_ERROR" || status >= 500 || count > 0) {
        errorBreakdown.gatewayFailures += count;
      }
    }

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
      p50LatencyMs: percentile(sortedLatencies, 50),
      p95LatencyMs: percentile(sortedLatencies, 95),
      p99LatencyMs: percentile(sortedLatencies, 99),
      errorCount,
      errorRate,
      errorBreakdown,
      topTools,
      clientApps,
      topCountries,
    };
  }
}
