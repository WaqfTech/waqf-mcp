import { eq, sql } from "drizzle-orm";
import { createDb, mcpCache } from "@waqf/db";
import type { ToolResult } from "@waqf/types";

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
      console.warn("D1 cache read failed:", err);
      return null;
    }
  }

  public async recordHit(cacheKey: string): Promise<void> {
    try {
      const db = createDb(this.d1);
      await db
        .update(mcpCache)
        .set({ hitCount: sql`${mcpCache.hitCount} + 1` })
        .where(eq(mcpCache.cacheKey, cacheKey));
    } catch (err) {
      console.warn("D1 record hit failed:", err);
    }
  }

  public async set(
    cacheKey: string,
    providerId: string,
    toolName: string,
    result: ToolResult,
    ttlSeconds = 60 * 60 * 24 * 30 // default 30 days
  ): Promise<void> {
    try {
      const db = createDb(this.d1);
      const now = new Date();
      const expires = ttlSeconds > 0 ? new Date(now.getTime() + ttlSeconds * 1000).toISOString() : null;

      await db
        .insert(mcpCache)
        .values({
          cacheKey,
          providerId,
          toolName,
          responsePayloadJson: JSON.stringify(result),
          hitCount: 1,
          createdAt: now.toISOString(),
          expiresAt: expires,
        })
        .onConflictDoUpdate({
          target: mcpCache.cacheKey,
          set: {
            responsePayloadJson: JSON.stringify(result),
            hitCount: sql`${mcpCache.hitCount} + 1`,
            expiresAt: expires,
          },
        });
    } catch (err) {
      console.warn("D1 cache write failed:", err);
    }
  }
}
