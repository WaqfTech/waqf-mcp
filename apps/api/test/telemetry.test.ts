import { describe, it, expect, vi } from "vitest";
import { D1TelemetryService } from "../src/services/telemetry";
import worker from "../src/index";

describe("D1TelemetryService", () => {
  const fakeD1 = {} as D1Database;
  const telemetry = new D1TelemetryService(fakeD1);

  it("hashes IP addresses using salt and SHA-256", async () => {
    const hash1 = await telemetry.hashIp("192.168.1.1");
    const hash2 = await telemetry.hashIp("192.168.1.1");
    const hash3 = await telemetry.hashIp("10.0.0.1");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64);
  });

  it("detects known AI and IDE clients from user-agent", () => {
    expect(telemetry.detectClientApp("Claude/1.0 (Anthropic)")).toBe("claude");
    expect(telemetry.detectClientApp("Cursor/0.45.0")).toBe("cursor");
    expect(telemetry.detectClientApp("Antigravity-Agent/2.0")).toBe("antigravity");
    expect(telemetry.detectClientApp("Cline/3.5")).toBe("cline");
    expect(telemetry.detectClientApp("curl/8.5.0")).toBe("curl");
    expect(telemetry.detectClientApp("Mozilla/5.0 Chrome/120.0")).toBe("other");
    expect(telemetry.detectClientApp(null)).toBe("unknown");
  });

  it("computes aggregated metrics from batched D1 SQL results", async () => {
    const mockBatch = vi.fn().mockResolvedValue([
      {
        results: [
          {
            total_requests: 100,
            cache_hits: 40,
            avg_latency_ms: 12.345,
            error_count: 5,
          },
        ],
      },
      {
        results: [
          { tool_name: "waqf_quran_get_ayah", count: 70, avg_latency_ms: 8.5 },
          { tool_name: "turath__search_turath", count: 30, avg_latency_ms: 22.1 },
        ],
      },
      {
        results: [
          { client_app: "cursor", count: 60 },
          { client_app: "claude", count: 40 },
        ],
      },
      {
        results: [
          { country: "SA", count: 50 },
          { country: "EG", count: 30 },
        ],
      },
    ]);

    const mockD1 = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
      }),
      batch: mockBatch,
    } as unknown as D1Database;

    const service = new D1TelemetryService(mockD1);
    const metrics = await service.getAggregatedMetrics(24);

    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(metrics.totalRequests).toBe(100);
    expect(metrics.cacheHits).toBe(40);
    expect(metrics.cacheHitRatio).toBe(0.4);
    expect(metrics.avgLatencyMs).toBe(12.35);
    expect(metrics.errorCount).toBe(5);
    expect(metrics.errorRate).toBe(0.05);
    expect(metrics.topTools).toHaveLength(2);
    expect(metrics.topTools[0].toolName).toBe("waqf_quran_get_ayah");
    expect(metrics.clientApps[0].clientApp).toBe("cursor");
    expect(metrics.topCountries[0].country).toBe("SA");
  });
});

describe("GET /api/stats Endpoint", () => {
  const mockCtx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  const mockBatch = vi.fn().mockResolvedValue([
    { results: [{ total_requests: 10, cache_hits: 4, avg_latency_ms: 15.2, error_count: 0 }] },
    { results: [{ tool_name: "waqf_quran_get_ayah", count: 10, avg_latency_ms: 15.2 }] },
    { results: [{ client_app: "curl", count: 10 }] },
    { results: [{ country: "US", count: 10 }] },
  ]);

  const mockEnv = {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
      }),
      batch: mockBatch,
    } as unknown as D1Database,
    ADMIN_API_KEY: "secret-test-token-123",
  };

  it("rejects unauthorized access without Authorization header", async () => {
    const req = new Request("http://localhost:8787/api/stats");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unauthorized");
  });

  it("rejects access with invalid Bearer token", async () => {
    const req = new Request("http://localhost:8787/api/stats", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(401);
  });

  it("serves aggregated metrics JSON when authorized with valid Bearer token", async () => {
    const req = new Request("http://localhost:8787/api/stats?hours=48", {
      headers: { Authorization: "Bearer secret-test-token-123" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalRequests: number;
      cacheHits: number;
      cacheHitRatio: number;
      timeWindowHours: number;
    };
    expect(body.totalRequests).toBe(10);
    expect(body.cacheHits).toBe(4);
    expect(body.cacheHitRatio).toBe(0.4);
    expect(body.timeWindowHours).toBe(48);
  });
});

