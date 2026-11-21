import { eq, sql } from "drizzle-orm";
import { createDb, mcpCache } from "@waqf/db";
import type { ToolResult } from "@waqf/types";

/**
 * Without the local schema applied (or on any D1 fault) caching degrades
 * silently: lookups keep missing and writes keep disappearing. Warn once per
 * isolate, naming the command that fixes it, instead of logging every request.
 */
let warnedD1Unavailable = false;
let warnedOversizeCache = false;

/** New entries live for one day; a cache hit promotes them to the provider TTL. */
export const INITIAL_CACHE_TTL_SECONDS = 60 * 60 * 24;

/** Used when a provider does not declare its own cache lifetime. */
export const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * D1 rejects rows above 2 MB. Cache payloads are bound twice by the upsert,
 * so cap them well below the row limit; oversized answers are served live.
 */
export const MAX_CACHE_PAYLOAD_BYTES = 256 * 1024;

export function initialCacheTtl(ttlSeconds: number): number {
  return ttlSeconds > 0 ? Math.min(ttlSeconds, INITIAL_CACHE_TTL_SECONDS) : 0;
}

function warnD1Unavailable(operation: string, error: unknown): void {
  if (warnedD1Unavailable) {
    return;
  }
  warnedD1Unavailable = true;
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(
    `[cache] D1 ${operation} failed — is the local schema applied? Run "aube run db:migrate:local". (${detail})`
  );
}

function warnOversizeCacheOnce(bytes: number): void {
  if (warnedOversizeCache) {
    return;
  }
  warnedOversizeCache = true;
  console.warn(
    `[cache] skipped a ${bytes}-byte payload; the cap is ${MAX_CACHE_PAYLOAD_BYTES} bytes.`
  );
}

export interface CacheProviderToolStats {
  providerId: string;
  toolName: string;
  entries: number;
  uses: number;
}

export interface CacheStats {
  provider: string | null;
  totals: {
    entries: number;
    uses: number;
    providerTools: number;
  };
  byProviderTool: CacheProviderToolStats[];
}

export class D1CacheService {
  constructor(private d1: D1Database) {}

  public async computeKey(providerId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    // Sort keys deterministically
    const sortedKeys = Object.keys(args).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = args[key];
    }

    const payload = `${providerId}:${toolName}:${JSON.stringify(normalized)}`;
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  public async get(cacheKey: string): Promise<ToolResult | null> {
    try {
      const db = createDb(this.d1);
      const rows = await db
        .select()
        .from(mcpCache)
        .where(eq(mcpCache.cacheKey, cacheKey))
        .limit(1);

      if (rows.length === 0) {
        return null;
      }

      const entry = rows[0];
      const now = new Date().toISOString();

      if (entry.expiresAt && entry.expiresAt < now) {
        return null; // Expired
      }

      return JSON.parse(entry.responsePayloadJson) as ToolResult;
    } catch (err) {
      warnD1Unavailable("read", err);
      return null;
    }
  }

  public async recordHit(
    cacheKey: string,
    ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
  ): Promise<void> {
    try {
      const db = createDb(this.d1);
      const expiresAt =
        ttlSeconds > 0
          ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
          : null;

      await db
        .update(mcpCache)
        .set({
          hitCount: sql`${mcpCache.hitCount} + 1`,
          expiresAt,
        })
        .where(eq(mcpCache.cacheKey, cacheKey));
    } catch (err) {
      warnD1Unavailable("hit counter update", err);
    }
  }

  public async set(
    cacheKey: string,
    providerId: string,
    toolName: string,
    result: ToolResult,
    ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
  ): Promise<void> {
    try {
      const payload = JSON.stringify(result);
      const payloadBytes = new TextEncoder().encode(payload).byteLength;
      if (payloadBytes > MAX_CACHE_PAYLOAD_BYTES) {
        warnOversizeCacheOnce(payloadBytes);
        return;
      }

      const db = createDb(this.d1);
      const now = new Date();
      const effectiveTtl = initialCacheTtl(ttlSeconds);
      const expires =
        effectiveTtl > 0
          ? new Date(now.getTime() + effectiveTtl * 1000).toISOString()
          : null;

      await db
        .insert(mcpCache)
        .values({
          cacheKey,
          providerId,
          toolName,
          responsePayloadJson: payload,
          hitCount: 1,
          createdAt: now.toISOString(),
          expiresAt: expires,
        })
        .onConflictDoUpdate({
          target: mcpCache.cacheKey,
          set: {
            responsePayloadJson: payload,
            hitCount: sql`${mcpCache.hitCount} + 1`,
            expiresAt: expires,
          },
        });
    } catch (err) {
      warnD1Unavailable("write", err);
    }
  }

  /**
   * Counts cache entries and uses by provider/tool. This is the reader for
   * idx_mcp_cache_provider_tool: grouping and the optional provider filter use
   * the index, and no payload column is selected, so the scan stays cheap.
   */
  public async getStats(providerId?: string): Promise<CacheStats> {
    const filter = providerId ? " WHERE provider_id = ?" : "";
    const groupStmt = this.d1.prepare(`
      SELECT provider_id, tool_name, COUNT(*) AS entries, SUM(hit_count) AS uses
      FROM mcp_cache${filter}
      GROUP BY provider_id, tool_name
      ORDER BY entries DESC
      LIMIT 100
    `);
    const totalsStmt = this.d1.prepare(`
      SELECT COUNT(*) AS entries,
             COALESCE(SUM(hit_count), 0) AS uses,
             COUNT(DISTINCT provider_id || ':' || tool_name) AS provider_tools
      FROM mcp_cache${filter}
    `);

    const [groupResult, totalsResult] = await this.d1.batch([
      providerId ? groupStmt.bind(providerId) : groupStmt,
      providerId ? totalsStmt.bind(providerId) : totalsStmt,
    ]);

    const byProviderTool = (groupResult.results as Array<Record<string, unknown>>).map(
      (row) => ({
        providerId: String(row.provider_id),
        toolName: String(row.tool_name),
        entries: Number(row.entries ?? 0),
        uses: Number(row.uses ?? 0),
      })
    );
    const totalsRow = totalsResult.results[0] as Record<string, unknown> | undefined;

    return {
      provider: providerId ?? null,
      totals: {
        entries: Number(totalsRow?.entries ?? 0),
        uses: Number(totalsRow?.uses ?? 0),
        providerTools: Number(
          totalsRow?.provider_tools ?? byProviderTool.length
        ),
      },
      byProviderTool,
    };
  }
}
