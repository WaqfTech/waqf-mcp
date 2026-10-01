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
    expect(res.headers.get("Link")).toContain('rel="api-catalog"');
    expect(res.headers.get("Link")).toContain('rel="service-doc"');
    expect(res.headers.get("Link")).toContain('rel="service-desc"');
    const body = (await res.json()) as { status: string; federatedProviders?: unknown[]; providers?: unknown[] };
    expect(body.status).toBe("healthy");
  });

  it("GET /mcp returns gateway discovery JSON and available suites", async () => {
    const req = new Request("http://localhost:8787/mcp");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Link")).toContain('rel="api-catalog"');
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
    expect(res.headers.get("Link")).toContain('rel="api-catalog"');
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
    expect(res.headers.get("Link")).toContain('rel="api-catalog"');
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

  it("GET / with Accept: text/markdown returns markdown and x-markdown-tokens", async () => {
    const req = new Request("http://localhost:8787/", {
      headers: { Accept: "text/markdown" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(res.headers.get("x-markdown-tokens")).toBeTruthy();
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('rel="api-catalog"');
    const text = await res.text();
    expect(text).toContain("# Waqf Islamic MCP Federation Gateway");
    expect(text).toContain("waqf_quran_get_ayah");
  });

  it("GET /en with Accept: text/markdown negotiates markdown content for agents", async () => {
    const req = new Request("http://localhost:8787/en", {
      headers: { Accept: "text/markdown" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(res.headers.get("x-markdown-tokens")).toBeTruthy();
  });

  it("GET /.well-known/api-catalog returns RFC 9727 linkset with application/linkset+json", async () => {
    const req = new Request("http://localhost:8787/.well-known/api-catalog");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/linkset+json");
    const data = (await res.json()) as { linkset: Array<{ anchor: string; "service-desc"?: unknown[]; "service-doc"?: unknown[]; status?: unknown[] }> };
    expect(Array.isArray(data.linkset)).toBe(true);
    expect(data.linkset.some((entry) => entry.anchor === "https://mcp.waqf.dev/mcp")).toBe(true);
    expect(data.linkset.some((entry) => entry.anchor === "https://mcp.waqf.dev/")).toBe(true);
  });

  it("GET /.well-known/mcp/server-card.json returns SEP-1649 metadata with application/json", async () => {
    const req = new Request("http://localhost:8787/.well-known/mcp/server-card.json");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { serverInfo: { name: string; version: string }; transport: { endpoint: string }; capabilities: Record<string, unknown> };
    expect(data.serverInfo.name).toBe("mcp.waqf.dev");
    expect(data.transport.endpoint).toBe("https://mcp.waqf.dev/mcp");
    expect(data.capabilities.tools).toBeDefined();
  });

  it("GET /.well-known/ai-catalog.json returns ARD manifest with specVersion and urn:air entries", async () => {
    const req = new Request("http://localhost:8787/.well-known/ai-catalog.json");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { specVersion: string; host: { name: string }; entries: Array<{ id: string; representativeQueries: string[] }> };
    expect(data.specVersion).toBe("1.0.0");
    expect(data.host.name).toBe("mcp.waqf.dev");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.some((e) => e.id === "urn:air:mcp.waqf.dev:mcp:core")).toBe(true);
    expect(data.entries.every((e) => Array.isArray(e.representativeQueries) && e.representativeQueries.length >= 2)).toBe(true);
  });

  it("GET /.well-known/agent-skills/index.json returns RFC v0.2.0 skills catalog with sha256 hashes", async () => {
    const req = new Request("http://localhost:8787/.well-known/agent-skills/index.json");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { $schema: string; skills: Array<{ name: string; type: string; url: string; sha256: string }> };
    expect(data.$schema).toContain("agentskills.io");
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.some((s) => s.name === "quran-tafsir")).toBe(true);
    expect(data.skills.every((s) => s.sha256.length === 64)).toBe(true);
  });

  it("GET /.well-known/oauth-authorization-server returns RFC 8414 metadata", async () => {
    const req = new Request("http://localhost:8787/.well-known/oauth-authorization-server");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { issuer: string; token_endpoint: string; scopes_supported: string[]; agent_auth?: { public_access: boolean } };
    expect(data.issuer).toBe("https://mcp.waqf.dev");
    expect(data.token_endpoint).toBe("https://mcp.waqf.dev/oauth/token");
    expect(data.scopes_supported).toContain("mcp:read");
    expect(data.agent_auth?.public_access).toBe(true);
  });

  it("GET /.well-known/oauth-protected-resource returns RFC 9728 metadata", async () => {
    const req = new Request("http://localhost:8787/.well-known/oauth-protected-resource");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
    expect(data.resource).toBe("https://mcp.waqf.dev");
    expect(data.authorization_servers).toContain("https://mcp.waqf.dev");
    expect(data.scopes_supported).toContain("mcp:read");
  });

  it("GET /auth.md returns agent authentication and registration instructions", async () => {
    const req = new Request("http://localhost:8787/auth.md");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("Agent Authentication & Registration Guide");
    expect(text).toContain("Open Waqf");
    expect(text).toContain("mcp.waqf.dev");
  });

  it("POST /oauth/register implements RFC 7591 Dynamic Client Registration", async () => {
    const req = new Request("http://localhost:8787/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Google Gemini",
        redirect_uris: ["https://gemini.google.com/auth/callback"],
      }),
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { client_id: string; client_name: string; redirect_uris: string[] };
    expect(data.client_id).toMatch(/^waqf_client_/);
    expect(data.client_name).toBe("Google Gemini");
    expect(data.redirect_uris).toContain("https://gemini.google.com/auth/callback");
  });

  it("GET /oauth/authorize redirects with code and state when redirect_uri is provided", async () => {
    const req = new Request("http://localhost:8787/oauth/authorize?redirect_uri=https%3A%2F%2Fgemini.google.com%2Fcallback&state=xyz123");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toBeDefined();
    expect(location).toContain("gemini.google.com/callback");
    expect(location).toContain("code=waqf_code_");
    expect(location).toContain("state=xyz123");
  });

  it("POST /oauth/token returns bearer access token", async () => {
    const req = new Request("http://localhost:8787/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "waqf_code_test",
      }),
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = (await res.json()) as { access_token: string; token_type: string; expires_in: number };
    expect(data.access_token).toMatch(/^waqf_token_/);
    expect(data.token_type).toBe("Bearer");
    expect(data.expires_in).toBeGreaterThan(0);
  });

  it("GET /.well-known/jwks.json returns empty JWKS set", async () => {
    const req = new Request("http://localhost:8787/.well-known/jwks.json");
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { keys: unknown[] };
    expect(Array.isArray(data.keys)).toBe(true);
  });
});


