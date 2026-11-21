import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

// 1. High-Precision Telemetry Logs
export const mcpLogs = sqliteTable(
  "mcp_logs",
  {
    id: text("id").primaryKey(),
    timestamp: text("timestamp").notNull(),
    clientIpHash: text("client_ip_hash").notNull(),
    country: text("country"),
    city: text("city"),
    region: text("region"),
    asn: integer("asn"),
    colo: text("colo"),
    userAgent: text("user_agent"),
    transportType: text("transport_type").notNull(), // 'http-post' | 'sse' | 'stream'
    clientApp: text("client_app"),
    method: text("method").notNull(),
    toolName: text("tool_name"),
    toolArgumentsJson: text("tool_arguments_json"),
    upstreamProvider: text("upstream_provider"),
    isCacheHit: integer("is_cache_hit", { mode: "boolean" }).notNull().default(false),
    statusCode: integer("status_code").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    errorMessage: text("error_message"),
    responseSizeBytes: integer("response_size_bytes"),
  },
  (table) => [
    index("idx_mcp_logs_timestamp").on(table.timestamp),
  ]
);

// 2. High-Performance Islamic Text Cache (D1)
export const mcpCache = sqliteTable(
  "mcp_cache",
  {
    cacheKey: text("cache_key").primaryKey(), // sha256(provider + normalized_query)
    providerId: text("provider_id").notNull(),
    toolName: text("tool_name").notNull(),
    responsePayloadJson: text("response_payload_json").notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("idx_mcp_cache_provider_tool").on(table.providerId, table.toolName),
    index("idx_mcp_cache_expires_at").on(table.expiresAt),
  ]
);

// 3. Community MCP Submissions (Contact Form)
export const mcpSubmissions = sqliteTable(
  "mcp_submissions",
  {
    id: text("id").primaryKey(),
    submitterName: text("submitter_name").notNull(),
    submitterEmail: text("submitter_email").notNull(),
    serverName: text("server_name").notNull(),
    serverUrl: text("server_url").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(), // 'quran' | 'hadith' | 'tafsir' | 'fiqh' | 'tools'
    status: text("status").notNull().default("pending"), // 'pending' | 'verified' | 'rejected'
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_mcp_submissions_status").on(table.status),
    index("idx_mcp_submissions_created_at").on(table.createdAt),
  ]
);

// 4. Daily Usage Rollups (survive raw-log and cache-payload retention)
export const mcpStatsDaily = sqliteTable(
  "mcp_stats_daily",
  {
    day: text("day").notNull(), // YYYY-MM-DD UTC
    dimension: text("dimension").notNull(), // provider | tool | country | client | method | status | colo | total
    value: text("value").notNull(),
    calls: integer("calls").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    cacheHits: integer("cache_hits").notNull().default(0),
    latencySumMs: integer("latency_sum_ms").notNull().default(0),
    latencyMaxMs: integer("latency_max_ms").notNull().default(0),
    responseBytes: integer("response_bytes").notNull().default(0),
    uniqueClients: integer("unique_clients").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.dimension, table.value] }),
    index("idx_mcp_stats_daily_dimension").on(table.dimension, table.day),
  ]
);

export type McpLog = typeof mcpLogs.$inferSelect;
export type NewMcpLog = typeof mcpLogs.$inferInsert;

export type McpCacheEntry = typeof mcpCache.$inferSelect;
export type NewMcpCacheEntry = typeof mcpCache.$inferInsert;

export type McpSubmission = typeof mcpSubmissions.$inferSelect;
export type NewMcpSubmissionRecord = typeof mcpSubmissions.$inferInsert;

export type McpStatsDaily = typeof mcpStatsDaily.$inferSelect;
export type NewMcpStatsDaily = typeof mcpStatsDaily.$inferInsert;
