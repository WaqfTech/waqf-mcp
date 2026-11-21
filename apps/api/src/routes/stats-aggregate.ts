import { checkAdminAuth } from "../admin";
import { CORS_HEADERS } from "../http";
import {
  aggregateDailyStats,
  aggregateDateRange,
  isValidDay,
  yesterdayUtc,
} from "../services/stats";

/**
 * Admin backfill and repair endpoint for the daily rollup table. The cron path
 * only handles yesterday; this lets an operator rebuild any complete or partial
 * UTC day after a deploy or a data correction.
 */
export async function handleStatsAggregateRequest(
  request: Request,
  env: { DB?: D1Database; ADMIN_API_KEY?: string }
): Promise<Response> {
  const authErr = checkAdminAuth(request, env);
  if (authErr) {
    return authErr;
  }
  if (!env.DB) {
    return json({ error: "Database not configured" }, 503);
  }
  return handleStatsAggregate(request, env.DB);
}

export async function handleStatsAggregate(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim();
  const daysParam = url.searchParams.get("days");

  try {
    if (date) {
      if (!isValidDay(date)) {
        return json({ error: "date must be a valid UTC day in YYYY-MM-DD form" }, 400);
      }
      const result = await aggregateDailyStats(db, date);
      return json({ results: [result] }, 200);
    }

    const requested = Number(daysParam ?? "30");
    const days = Number.isFinite(requested) ? Math.max(1, Math.min(90, Math.floor(requested))) : 30;
    const results = await aggregateDateRange(db, days, yesterdayUtc());
    return json({ days: results.length, results }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
