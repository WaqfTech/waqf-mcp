import { describe, it, expect, vi, beforeEach } from "vitest";
import worker, { isSubmissionRateLimited, resetSubmissionRateLimits } from "../src/index";

describe("Community MCP Submissions & Telemetry Optimizations", () => {
  const mockCtx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    resetSubmissionRateLimits();
    vi.clearAllMocks();
  });

  const createMockDb = (existingSubmissions: unknown[] = []) => {
    return {
      prepare: vi.fn().mockImplementation((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: existingSubmissions }),
        raw: vi.fn().mockImplementation(() => {
          if (query.includes("WHERE") && existingSubmissions.length > 0) {
            return Promise.resolve(existingSubmissions);
          }
          return Promise.resolve(existingSubmissions);
        }),
        first: vi.fn().mockResolvedValue(existingSubmissions[0] || null),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    } as unknown as D1Database;
  };

  it("POST /api/submissions rejects invalid email format", async () => {
    const mockEnv = {
      DB: createMockDb([]),
    };

    const req = new Request("http://localhost:8787/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterName: "Tariq",
        submitterEmail: "invalid-email-address",
        serverName: "Tafsir Explorer",
        serverUrl: "https://tafsir.example.com/mcp",
        category: "tafsir",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid submitterEmail format");
  });

  it("POST /api/submissions enforces rate limiting of 5 requests per hour per IP", async () => {
    const mockEnv = {
      DB: createMockDb([]),
    };

    const makeRequest = (ip: string) =>
      new Request("http://localhost:8787/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify({
          submitterName: "Tariq",
          submitterEmail: "tariq@example.com",
          serverName: "Tafsir Explorer",
          serverUrl: `https://tafsir.example.com/mcp-${Math.random()}`,
          category: "tafsir",
        }),
      });

    // First 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      const res = await worker.fetch(makeRequest("198.51.100.1"), mockEnv, mockCtx);
      expect(res.status).toBe(201);
    }

    // 6th request from same IP should be blocked with 429
    const blockedRes = await worker.fetch(makeRequest("198.51.100.1"), mockEnv, mockCtx);
    expect(blockedRes.status).toBe(429);
    const body = (await blockedRes.json()) as { error: string };
    expect(body.error).toContain("Too many submissions from this IP");

    // Different IP should still be allowed
    const diffIpRes = await worker.fetch(makeRequest("198.51.100.2"), mockEnv, mockCtx);
    expect(diffIpRes.status).toBe(201);
  });

  it("POST /api/submissions rejects duplicate server URLs", async () => {
    const existingSubmission = [
      {
        id: "existing-sub-1",
        serverUrl: "https://existing.example.com/mcp",
      },
    ];

    const mockEnv = {
      DB: createMockDb(existingSubmission),
    };

    const req = new Request("http://localhost:8787/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterName: "Zayd",
        submitterEmail: "zayd@example.com",
        serverName: "Duplicate Server",
        serverUrl: "https://existing.example.com/mcp",
        category: "hadith",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already been submitted");
  });

  it("OPTIONS /api/submissions returns CORS headers including PATCH", async () => {
    const req = new Request("http://localhost:8787/api/submissions", {
      method: "OPTIONS",
    });

    const res = await worker.fetch(req, { DB: createMockDb([]) }, mockCtx);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
  });

  it("GET /api/submissions requires ADMIN_API_KEY Bearer authentication", async () => {
    const mockEnv = {
      DB: createMockDb([]),
      ADMIN_API_KEY: "secret-admin-key",
    };

    // Missing key configured on server
    const noKeyRes = await worker.fetch(
      new Request("http://localhost:8787/api/submissions"),
      { DB: createMockDb([]) },
      mockCtx
    );
    expect(noKeyRes.status).toBe(503);

    // Missing auth header
    const noAuthRes = await worker.fetch(
      new Request("http://localhost:8787/api/submissions"),
      mockEnv,
      mockCtx
    );
    expect(noAuthRes.status).toBe(401);

    // Invalid token
    const wrongAuthRes = await worker.fetch(
      new Request("http://localhost:8787/api/submissions", {
        headers: { Authorization: "Bearer wrong-token" },
      }),
      mockEnv,
      mockCtx
    );
    expect(wrongAuthRes.status).toBe(401);

    // Valid token
    const validRes = await worker.fetch(
      new Request("http://localhost:8787/api/submissions?status=all", {
        headers: { Authorization: "Bearer secret-admin-key" },
      }),
      mockEnv,
      mockCtx
    );
    expect(validRes.status).toBe(200);
  });

  it("PATCH /api/submissions updates submission status with validation", async () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => {
          const stmtObj = {
            bind: vi.fn().mockReturnThis(),
            raw: vi.fn().mockImplementation(() => {
              if (query.toLowerCase().includes("update")) {
                return Promise.resolve([
                  [
                    "sub-123",
                    "Tariq",
                    "tariq@example.com",
                    "Qiraat Server",
                    "https://qiraat.example.com",
                    "description",
                    "quran",
                    "verified",
                    "2026-10-04T00:00:00.000Z",
                  ],
                ]);
              }
              return Promise.resolve([]);
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
          return stmtObj;
        }),
      } as unknown as D1Database,
      ADMIN_API_KEY: "secret-admin-key",
    };

    // Invalid status
    const invalidStatusReq = new Request("http://localhost:8787/api/submissions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-key",
      },
      body: JSON.stringify({ id: "sub-123", status: "not-a-real-status" }),
    });
    const invalidRes = await worker.fetch(invalidStatusReq, mockEnv, mockCtx);
    expect(invalidRes.status).toBe(400);

    // Missing id
    const missingIdReq = new Request("http://localhost:8787/api/submissions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-key",
      },
      body: JSON.stringify({ status: "verified" }),
    });
    const missingRes = await worker.fetch(missingIdReq, mockEnv, mockCtx);
    expect(missingRes.status).toBe(400);

    // Valid update
    const validReq = new Request("http://localhost:8787/api/submissions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-key",
      },
      body: JSON.stringify({ id: "sub-123", status: "verified" }),
    });
    const validRes = await worker.fetch(validReq, mockEnv, mockCtx);
    expect(validRes.status).toBe(200);
    const body = (await validRes.json()) as { success: boolean; submission: { status: string } };
    expect(body.success).toBe(true);
    expect(body.submission.status).toBe("verified");
  });

  it("POST /mcp records response_size_bytes and caps tool_arguments_json in telemetry", async () => {
    let capturedTelemetry: Record<string, unknown> | null = null;

    const mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockImplementation((...args: unknown[]) => {
            // Drizzle insert statement parameter binding
            return {
              run: vi.fn().mockImplementation(() => {
                capturedTelemetry = {
                  args,
                };
                return Promise.resolve({ success: true });
              }),
              raw: vi.fn().mockResolvedValue([]),
              all: vi.fn().mockResolvedValue({ results: [] }),
              first: vi.fn().mockResolvedValue(null),
            };
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
          raw: vi.fn().mockResolvedValue([]),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        }),
      } as unknown as D1Database,
    };

    // Huge argument payload exceeding 2000 characters
    const hugePayload = "A".repeat(3000);
    const req = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 100,
        method: "tools/call",
        params: {
          name: "waqf_quran_get_ayah",
          arguments: {
            surah: 1,
            ayah: 1,
            extraPadding: hugePayload,
          },
        },
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(mockCtx.waitUntil).toHaveBeenCalled();
  });
});
