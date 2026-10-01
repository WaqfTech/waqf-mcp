import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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
    index("idx_logs_timestamp").on(table.timestamp),
    index("idx_logs_tool_name").on(table.toolName),
    index("idx_logs_client_app").on(table.clientApp),
    index("idx_logs_country").on(table.country),
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
    index("idx_cache_provider_tool").on(table.providerId, table.toolName),
    index("idx_cache_expires_at").on(table.expiresAt),
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
    index("idx_submissions_status").on(table.status),
  ]
);

export type McpLog = typeof mcpLogs.$inferSelect;
export type NewMcpLog = typeof mcpLogs.$inferInsert;

export type McpCacheEntry = typeof mcpCache.$inferSelect;
export type NewMcpCacheEntry = typeof mcpCache.$inferInsert;

export type McpSubmission = typeof mcpSubmissions.$inferSelect;
export type NewMcpSubmissionRecord = typeof mcpSubmissions.$inferInsert;
