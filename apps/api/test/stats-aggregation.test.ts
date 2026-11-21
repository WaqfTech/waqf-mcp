import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import {
  aggregateDailyStats,
  aggregateDateRange,
  dayBounds,
  isValidDay,
} from "../src/services/stats";

interface FakeStatement {
  sql: string;
  bindings: unknown[];
  bind: (...args: unknown[]) => FakeStatement;
}

function fakeDb(changes = 1) {
  const statements: FakeStatement[] = [];
  const batch = vi.fn(async (prepared: unknown[]) =>
    prepared.map(() => ({ success: true, results: [], meta: { changes } }))
  );
  const prepare = vi.fn((sql: string) => {
    const statement: FakeStatement = {
      sql,
      bindings: [],
      bind(...args: unknown[]) {
        statement.bindings = args;
        statements.push(statement);
        return statement;
      },
    };
    return statement;
  });

  return {
    db: { prepare, batch } as unknown as D1Database,
    statements,
    batch,
  };
}

describe("Daily stats aggregation", () => {
  it("validates UTC days and computes half-open bounds", () => {
    expect(isValidDay("2026-11-20")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-13-01")).toBe(false);
    expect(isValidDay("20-11-2026")).toBe(false);
    expect(dayBounds("2026-11-20")).toEqual({
      from: "2026-11-20T00:00:00.000Z",
      to: "2026-11-21T00:00:00.000Z",
    });
  });

  it("rebuilds one day in a single batch", async () => {
    const { db, statements, batch } = fakeDb(1);
    const result = await aggregateDailyStats(db, "2026-11-20");

    expect(batch).toHaveBeenCalledTimes(1);
    expect(statements).toHaveLength(9); // delete + 7 dimensions + total
    expect(statements[0].sql).toContain("DELETE FROM mcp_stats_daily");
    expect(statements[0].bindings).toEqual(["2026-11-20"]);

    const provider = statements.find((statement) =>
      statement.bindings.includes("provider")
    );
    expect(provider).toBeDefined();
    expect(provider?.bindings).toEqual([
      "2026-11-20",
      "provider",
      "2026-11-20T00:00:00.000Z",
      "2026-11-21T00:00:00.000Z",
    ]);
    expect(result).toEqual({ day: "2026-11-20", changedRows: 9 });
  });

  it("backfills a range oldest-first", async () => {
    const { db } = fakeDb(1);
    const results = await aggregateDateRange(db, 3, "2026-11-20");

    expect(results.map((result) => result.day)).toEqual([
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
    ]);
  });
});

describe("POST /api/stats/aggregate", () => {
  const mockCtx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  it("rejects unauthorized access", async () => {
    const { db } = fakeDb();
    const req = new Request("http://localhost:8787/api/stats/aggregate?date=2026-11-20", {
      method: "POST",
    });
    const res = await worker.fetch(
      req,
      { DB: db, ADMIN_API_KEY: "secret" },
      mockCtx
    );

    expect(res.status).toBe(401);
  });

  it("rejects an invalid date", async () => {
    const { db } = fakeDb();
    const req = new Request("http://localhost:8787/api/stats/aggregate?date=2026-02-30", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    });
    const res = await worker.fetch(
      req,
      { DB: db, ADMIN_API_KEY: "secret" },
      mockCtx
    );

    expect(res.status).toBe(400);
  });

  it("aggregates a single day for an authorized request", async () => {
    const { db } = fakeDb(2);
    const req = new Request("http://localhost:8787/api/stats/aggregate?date=2026-11-20", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    });
    const res = await worker.fetch(
      req,
      { DB: db, ADMIN_API_KEY: "secret" },
      mockCtx
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ day: string; changedRows: number }>;
    };
    expect(body.results[0]).toEqual({ day: "2026-11-20", changedRows: 18 });
  });

  it("runs the scheduled job through the same aggregation path", async () => {
    const { db, batch } = fakeDb(1);
    let pending: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    await worker.scheduled(
      {} as ScheduledController,
      { DB: db } as Env,
      ctx
    );
    await pending;

    expect(batch).toHaveBeenCalledTimes(1);
  });
});
