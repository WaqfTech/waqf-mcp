import { describe, it, expect, vi } from "vitest";
import { D1CacheService } from "../src/services/cache";
import worker, { type Env } from "../src/index";

function mockCacheDb() {
  const bind = vi.fn().mockReturnThis();
  const prepare = vi.fn().mockReturnValue({ bind });
  const batch = vi.fn().mockResolvedValue([
    {
      results: [
        { provider_id: "aljam3", tool_name: "search", entries: 10, uses: 12 },
        { provider_id: "turath", tool_name: "search_turath", entries: 5, uses: 6 },
      ],
    },
    { results: [{ entries: 15, uses: 18, provider_tools: 2 }] },
  ]);

  return {
    db: { prepare, batch } as unknown as D1Database,
    prepare,
    bind,
    batch,
  };
}

describe("D1CacheService.getStats", () => {
  it("groups entries and uses by provider and tool", async () => {
    const { db } = mockCacheDb();
    const stats = await new D1CacheService(db).getStats();

    expect(stats.provider).toBeNull();
    expect(stats.totals).toEqual({ entries: 15, uses: 18, providerTools: 2 });
    expect(stats.byProviderTool).toEqual([
      { providerId: "aljam3", toolName: "search", entries: 10, uses: 12 },
      { providerId: "turath", toolName: "search_turath", entries: 5, uses: 6 },
    ]);
  });

  it("filters by provider through the provider/tool index", async () => {
    const { db, bind } = mockCacheDb();
    const stats = await new D1CacheService(db).getStats("aljam3");

    expect(stats.provider).toBe("aljam3");
    expect(bind).toHaveBeenCalledWith("aljam3");
  });
});

describe("GET /api/cache/stats", () => {
  const mockCtx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  it("rejects unauthorized access", async () => {
    const { db } = mockCacheDb();
    const req = new Request("http://localhost:8787/api/cache/stats");
    const res = await worker.fetch(
      req,
      { DB: db, ADMIN_API_KEY: "secret-admin-key" },
      mockCtx
    );

    expect(res.status).toBe(401);
  });

  it("serves cache inventory for an authorized request", async () => {
    const { db } = mockCacheDb();
    const req = new Request("http://localhost:8787/api/cache/stats?provider=aljam3", {
      headers: { Authorization: "Bearer secret-admin-key" },
    });
    const res = await worker.fetch(
      req,
      { DB: db, ADMIN_API_KEY: "secret-admin-key" },
      mockCtx
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      totals: { entries: number; uses: number; providerTools: number };
      byProviderTool: Array<{ providerId: string; toolName: string }>;
    };
    expect(body.provider).toBe("aljam3");
    expect(body.totals.entries).toBe(15);
    expect(body.byProviderTool[0]?.providerId).toBe("aljam3");
  });

  it("returns 503 when the database binding is missing", async () => {
    const req = new Request("http://localhost:8787/api/cache/stats", {
      headers: { Authorization: "Bearer secret-admin-key" },
    });
    const res = await worker.fetch(
      req,
      { ADMIN_API_KEY: "secret-admin-key" } as unknown as Env,
      mockCtx
    );

    expect(res.status).toBe(503);
  });
});
