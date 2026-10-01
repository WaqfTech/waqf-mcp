import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";

describe("Waqf MCP Gateway Worker E2E", () => {
  const mockCtx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  const mockEnv = {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    } as unknown as D1Database,
  };

  it("GET / returns gateway health and provider status", async () => {
    const req = new Request("http://localhost:8787/");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; federatedProviders?: unknown[]; providers?: unknown[] };
    expect(body.status).toBe("healthy");
  });

  it("GET /mcp returns gateway discovery JSON and available suites", async () => {
    const req = new Request("http://localhost:8787/mcp");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; endpoint: string; suites: Record<string, string> };
    expect(body.status).toBe("healthy");
    expect(body.endpoint).toBe("/mcp");
    expect(body.suites.core).toBeDefined();
  });

  it("GET /mcp/ (trailing slash) also resolves successfully", async () => {
    const req = new Request("http://localhost:8787/mcp/");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("healthy");
  });

  it("GET /mcp with Accept: text/event-stream initiates SSE stream", async () => {
    const req = new Request("http://localhost:8787/mcp", {
      headers: { Accept: "text/event-stream" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("POST /mcp handles 'initialize' method", async () => {
    const req = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe("waqf-islamic-federation");
  });

  it("POST /mcp handles 'ping' method", async () => {
    const req = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 42,
        method: "ping",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number; result: Record<string, unknown> };
    expect(body.id).toBe(42);
  });

  it("POST /mcp?suite=core returns only canonical tools", async () => {
    const req = new Request("http://localhost:8787/mcp?suite=core", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.length).toBeGreaterThanOrEqual(3);
    expect(body.result.tools.every((t) => t.name.startsWith("waqf_"))).toBe(true);
  });

  it("POST /mcp returns -32601 for unrecognized methods", async () => {
    const req = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "non_existent_method",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("POST /api/submissions accepts community MCP submissions", async () => {
    const req = new Request("http://localhost:8787/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterName: "Zayd",
        submitterEmail: "zayd@example.com",
        serverName: "Qiraat Al-Madinah",
        serverUrl: "https://qiraat.example.com/mcp",
        category: "quran",
        description: "10 Mutawatir recitations MCP server",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("POST /api/submissions rejects invalid URL protocols", async () => {
    const req = new Request("http://localhost:8787/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterName: "Zayd",
        submitterEmail: "zayd@example.com",
        serverName: "Invalid Server",
        serverUrl: "javascript:alert(1)",
        category: "quran",
      }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("serverUrl must start with https:// or http://");
  });

  it("POST /mcp rejects oversized payloads exceeding 1MB", async () => {
    const req = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2097152", // 2MB
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Payload exceeds 1MB limit");
  });

  it("GET / with Accept: text/html delegates to env.WEB service binding", async () => {
    const mockWebFetch = vi.fn().mockResolvedValue(new Response("<html>Astro Web Landing</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));

    const envWithWeb: typeof mockEnv & { WEB: Fetcher } = {
      ...mockEnv,
      WEB: { fetch: mockWebFetch } as unknown as Fetcher,
    };

    const req = new Request("http://localhost:8787/", {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });

    const res = await worker.fetch(req, envWithWeb, mockCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html");
    const html = await res.text();
    expect(html).toContain("Astro Web Landing");
    expect(mockWebFetch).toHaveBeenCalledTimes(1);
  });

  it("GET /en delegates non-API web routes to env.WEB service binding", async () => {
    const mockWebFetch = vi.fn().mockResolvedValue(new Response("<html>English Landing</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));

    const envWithWeb: typeof mockEnv & { WEB: Fetcher } = {
      ...mockEnv,
      WEB: { fetch: mockWebFetch } as unknown as Fetcher,
    };

    const req = new Request("http://localhost:8787/en", {
      headers: { Accept: "text/html" },
    });

    const res = await worker.fetch(req, envWithWeb, mockCtx);
    expect(res.status).toBe(200);
    expect(mockWebFetch).toHaveBeenCalledTimes(1);
  });

  it("GET /llms.txt returns agent discovery markdown with 200", async () => {
    const req = new Request("http://localhost:8787/llms.txt");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("# Waqf Islamic MCP Federation Gateway");
    expect(text).toContain("waqf_quran_get_ayah");
    expect(text).toContain("https://mcp.waqf.dev/llms-full.txt");
  });

  it("GET /llms-full.txt returns full technical catalog with 200", async () => {
    const req = new Request("http://localhost:8787/llms-full.txt");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("Waqf Islamic MCP Federation Gateway — Full Technical Reference");
    expect(text).toContain("waqf_search_scholarship");
    expect(text).toContain("tafsir_net__fetch_ayah");
    expect(text).toContain("fihris__search_islamic_sources");
  });

  it("GET /robots.txt returns crawl rules with 200 and text/plain", async () => {
    const req = new Request("http://localhost:8787/robots.txt");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes");
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Allow: /");
    expect(text).toContain("User-agent: OAI-SearchBot");
    expect(text).toContain("User-agent: Claude-SearchBot");
    expect(text).toContain("User-agent: PerplexityBot");
    expect(text).toContain("User-agent: GPTBot");
    expect(text).toContain("User-agent: ClaudeBot");
    expect(text).toContain("User-agent: Google-Extended");
    expect(text).toContain("Sitemap: https://mcp.waqf.dev/sitemap.xml");
  });

  it("GET /sitemap.xml returns XML sitemap with 200 and application/xml", async () => {
    const req = new Request("http://localhost:8787/sitemap.xml");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const text = await res.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("<loc>https://mcp.waqf.dev/</loc>");
    expect(text).toContain("hreflang=\"ar\"");
    expect(text).toContain("hreflang=\"en\"");
  });
});

