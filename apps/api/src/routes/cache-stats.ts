import { checkAdminAuth } from "../admin";
import { CORS_HEADERS } from "../http";
import { D1CacheService } from "../services/cache";

export async function handleCacheStatsRequest(
  request: Request,
  env: { DB?: D1Database; ADMIN_API_KEY?: string }
): Promise<Response> {
  const authErr = checkAdminAuth(request, env);
  if (authErr) {
    return authErr;
  }
  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: "Database not configured" }),
      { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
  return handleCacheStats(request, env.DB);
}

/**
 * Admin-only cache inventory. This is the reader for
 * idx_mcp_cache_provider_tool: the grouped query and the optional provider
 * filter use the index, and the payload column is never selected.
 */
export async function handleCacheStats(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider")?.trim() || undefined;

  try {
    const stats = await new D1CacheService(db).getStats(provider);
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
