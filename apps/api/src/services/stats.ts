/**
 * Daily usage rollups. These rows are small, additive, and safe to keep after
 * raw logs and cache payloads are retired. One INSERT ... SELECT per dimension
 * keeps the work inside D1; no request rows are pulled into the Worker.
 */
export const STATS_DIMENSIONS = [
  "provider",
  "tool",
  "country",
  "client",
  "method",
  "status",
  "colo",
] as const;

export type StatsDimension = (typeof STATS_DIMENSIONS)[number];

const VALUE_EXPRESSIONS: Record<StatsDimension, string> = {
  provider: "COALESCE(upstream_provider, 'gateway')",
  tool: "COALESCE(tool_name, '(non-tool)')",
  country: "COALESCE(country, 'unknown')",
  client: "COALESCE(client_app, 'unknown')",
  method: "method",
  status: "CAST(status_code AS TEXT)",
  colo: "COALESCE(colo, 'unknown')",
};

const METRICS = `
  COUNT(*) AS calls,
  SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
  SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
  SUM(latency_ms) AS latency_sum_ms,
  MAX(latency_ms) AS latency_max_ms,
  SUM(COALESCE(response_size_bytes, 0)) AS response_bytes,
  COUNT(DISTINCT client_ip_hash) AS unique_clients
`;

const UPSERT = `
  ON CONFLICT(day, dimension, value) DO UPDATE SET
    calls = excluded.calls,
    errors = excluded.errors,
    cache_hits = excluded.cache_hits,
    latency_sum_ms = excluded.latency_sum_ms,
    latency_max_ms = excluded.latency_max_ms,
    response_bytes = excluded.response_bytes,
    unique_clients = excluded.unique_clients
`;

export interface DailyAggregateResult {
  day: string;
  changedRows: number;
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

export function dayBounds(day: string): { from: string; to: string } {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export function buildDimensionInsert(
  db: D1Database,
  dimension: StatsDimension,
  day: string,
  from: string,
  to: string
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO mcp_stats_daily
         (day, dimension, value, calls, errors, cache_hits, latency_sum_ms, latency_max_ms, response_bytes, unique_clients)
       SELECT ?, ?, ${VALUE_EXPRESSIONS[dimension]}, ${METRICS}
       FROM mcp_logs
       WHERE timestamp >= ? AND timestamp < ?
       GROUP BY 3
       ${UPSERT}`
    )
    .bind(day, dimension, from, to);
}

export function buildTotalInsert(
  db: D1Database,
  day: string,
  from: string,
  to: string
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO mcp_stats_daily
         (day, dimension, value, calls, errors, cache_hits, latency_sum_ms, latency_max_ms, response_bytes, unique_clients)
       SELECT ?, 'total', 'all', ${METRICS}
       FROM mcp_logs
       WHERE timestamp >= ? AND timestamp < ?
       ${UPSERT}`
    )
    .bind(day, from, to);
}

export async function aggregateDailyStats(
  db: D1Database,
  day: string
): Promise<DailyAggregateResult> {
  if (!isValidDay(day)) {
    throw new Error(`Invalid UTC day '${day}'; expected YYYY-MM-DD`);
  }

  const { from, to } = dayBounds(day);
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM mcp_stats_daily WHERE day = ?").bind(day),
  ];

  for (const dimension of STATS_DIMENSIONS) {
    statements.push(buildDimensionInsert(db, dimension, day, from, to));
  }
  statements.push(buildTotalInsert(db, day, from, to));

  const results = await db.batch(statements);
  const changedRows = results.reduce(
    (total, result) => total + Number(result.meta?.changes ?? 0),
    0
  );

  return { day, changedRows };
}

export function runScheduledAggregation(
  env: { DB?: D1Database },
  ctx: ExecutionContext
): void {
  if (!env.DB) {
    return;
  }
  const day = yesterdayUtc();
  ctx.waitUntil(
    aggregateDailyStats(env.DB, day)
      .then((result) => {
        console.log(`[stats] aggregated ${result.day} (${result.changedRows} rows)`);
      })
      .catch((err: unknown) => {
        console.error(`[stats] aggregation failed for ${day}:`, err);
      })
  );
}

export async function aggregateDateRange(
  db: D1Database,
  days: number,
  untilDay = yesterdayUtc()
): Promise<DailyAggregateResult[]> {
  const count = Math.max(1, Math.min(90, Math.floor(days)));
  const end = new Date(`${untilDay}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid UTC day '${untilDay}'`);
  }

  const results: DailyAggregateResult[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const day = new Date(end.getTime() - offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    results.push(await aggregateDailyStats(db, day));
  }
  return results;
}
