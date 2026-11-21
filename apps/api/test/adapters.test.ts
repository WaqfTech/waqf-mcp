import { describe, it, expect, vi, beforeEach } from "vitest";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { SseMcpAdapter } from "../src/adapters/sse";
import { clearRequestFetchers, resetCircuitBreakers, setRequestFetcher } from "../src/adapters/base";
import { ProviderRegistry } from "../src/core/registry";
import { FederationRouter } from "../src/core/router";

describe("MCP Adapters & Federation Router", () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });
  it("JsonRpcMcpAdapter parses tools/list response correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            {
              name: "search_turath",
              description: "Search books",
              inputSchema: { type: "object" },
            },
          ],
        },
      }),
    });

    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "turath",
      name: "Turath",
      baseUrl: "https://mcp.turath.io/mcp/",
      transport: "json-rpc",
      description: "Turath Library",
    });

    const tools = await adapter.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("search_turath");
  });

  it("SseMcpAdapter parses SSE chunks correctly", async () => {
    const mockSseText = `event: message\ndata: {"result":{"tools":[{"name":"fetch_ayah","description":"Ayah text","inputSchema":{}}]}}\n\n`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockSseText,
    });

    globalThis.fetch = mockFetch;

    const adapter = new SseMcpAdapter({
      id: "tafsir",
      name: "Tafsir",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir Suite",
    });

    const tools = await adapter.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("fetch_ayah");
  });

  it("preserves upstream structuredContent in JsonRpcMcpAdapter and SseMcpAdapter", async () => {
    const structured = { schema_version: "1.0.0", items: [{ id: 1 }] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: "ok" }],
          structuredContent: structured,
        },
      }),
    });
    const jsonRpc = new JsonRpcMcpAdapter({
      id: "shamela",
      name: "Shamela",
      baseUrl: "https://mcp.shamela.ws",
      transport: "json-rpc",
      description: "Shamela",
    });
    const rpcRes = await jsonRpc.callTool("shamela_find", { keywords: ["x"] });
    expect(rpcRes.structuredContent).toEqual(structured);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `event: message\ndata: ${JSON.stringify({
          result: { content: [{ type: "text", text: "ok" }], structuredContent: structured },
        })}\n\n`,
    });
    const sse = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir",
    });
    const sseRes = await sse.callTool("fetch_ayah", { surah: 1, ayah: 1 });
    expect(sseRes.structuredContent).toEqual(structured);
  });

  it("FederationRouter prefixes tool names to prevent collisions", async () => {
    const registry = new ProviderRegistry([]);

    const mockTurath = new JsonRpcMcpAdapter({
      id: "turath",
      name: "Turath",
      baseUrl: "https://mcp.turath.io/mcp/",
      transport: "json-rpc",
      description: "Turath",
    });
    vi.spyOn(mockTurath, "listTools").mockResolvedValue([
      { name: "get_book", inputSchema: {} },
    ]);

    const mockMaher = new SseMcpAdapter({
      id: "maher",
      name: "Maher",
      baseUrl: "https://maheralfahel.net/mcp/",
      transport: "sse",
      description: "Maher",
    });
    vi.spyOn(mockMaher, "listTools").mockResolvedValue([
      { name: "get-book", inputSchema: {} },
    ]);

    registry.register(mockTurath);
    registry.register(mockMaher);

    const router = new FederationRouter(registry);
    const tools = await router.listAllTools("raw");

    expect(tools.map((t) => t.name)).toEqual([
      "turath__get_book",
      "maher__get-book",
    ]);
  });

  it("SseMcpAdapter handles resources/list and resources/read correctly", async () => {
    const listPayload = `event: message\ndata: {"result":{"resources":[{"uri":"quran://surahs","name":"surahs_catalog","mimeType":"text/plain"}]}}\n\n`;
    const readPayload = `event: message\ndata: {"result":{"contents":[{"uri":"quran://surahs","text":"[{\\"id\\":1,\\"name\\":\\"Al-Fatihah\\"}]"}]}}\n\n`;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => listPayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => readPayload,
      });

    globalThis.fetch = mockFetch;

    const adapter = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir Suite",
    });

    const resources = await adapter.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("quran://surahs");

    const read = await adapter.readResource("quran://surahs");
    expect(read.contents).toHaveLength(1);
    expect(read.contents[0].text).toContain("Al-Fatihah");
  });

  it("SseMcpAdapter handles prompts/list and prompts/get correctly", async () => {
    const listPayload = `event: message\ndata: {"result":{"prompts":[{"name":"study_ayah","description":"Ayah study"}]}}\n\n`;
    const getPayload = `event: message\ndata: {"result":{"messages":[{"role":"user","content":{"type":"text","text":"Study Surah 1 Ayah 1"}}]}}\n\n`;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => listPayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => getPayload,
      });

    globalThis.fetch = mockFetch;

    const adapter = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir Suite",
    });

    const prompts = await adapter.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("study_ayah");

    const promptRes = await adapter.getPrompt("study_ayah", { surah: "1", ayah: "1" });
    expect(promptRes.messages).toHaveLength(1);
    expect(promptRes.messages[0].role).toBe("user");
  });

  it("JsonRpcMcpAdapter handles resources and prompts correctly", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: { resources: [{ uri: "turath://catalog", name: "catalog" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: { contents: [{ uri: "turath://catalog", text: "books list" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: { prompts: [{ name: "search_author", description: "Search author" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: { messages: [{ role: "user", content: { type: "text", text: "Find Bukhari" } }] },
        }),
      });

    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "turath",
      name: "Turath",
      baseUrl: "https://mcp.turath.io/mcp/",
      transport: "json-rpc",
      description: "Turath Library",
    });

    const resources = await adapter.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("turath://catalog");

    const read = await adapter.readResource("turath://catalog");
    expect(read.contents[0].text).toBe("books list");

    const prompts = await adapter.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("search_author");

    const prompt = await adapter.getPrompt("search_author", { author: "Bukhari" });
    expect(prompt.messages[0].content).toEqual({ type: "text", text: "Find Bukhari" });
  });

  it("routes a provider through its registered service binding instead of the public edge", async () => {
    const publicFetch = vi.fn();
    globalThis.fetch = publicFetch;

    const boundFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: { tools: [{ name: "search_islamic_sources", description: "search", inputSchema: {} }] },
      }),
    });

    const adapter = new JsonRpcMcpAdapter({
      id: "fihris",
      name: "Fihris",
      baseUrl: "https://search.waqf.app/api/mcp",
      transport: "json-rpc",
      description: "Fihris Islamic Web Search",
    });

    setRequestFetcher("fihris", { fetch: boundFetch } as unknown as Fetcher);
    try {
      const tools = await adapter.listTools();

      expect(tools[0].name).toBe("search_islamic_sources");
      expect(boundFetch).toHaveBeenCalledTimes(1);
      // The bound request keeps the public URL so the target Worker routes identically.
      expect(boundFetch.mock.calls[0][0]).toBe("https://search.waqf.app/api/mcp");
      expect(publicFetch).not.toHaveBeenCalled();
    } finally {
      clearRequestFetchers();
    }
  });

  it("JsonRpcMcpAdapter posts root-mounted bases verbatim without appending /mcp/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: {
          tools: [{ name: "shamela_find", description: "Search", inputSchema: { type: "object" } }],
        },
      }),
    });

    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "shamela",
      name: "Shamela",
      baseUrl: "https://mcp.shamela.ws",
      transport: "json-rpc",
      description: "Shamela",
    });

    const tools = await adapter.listTools();
    expect(tools).toHaveLength(1);
    // The official Shamela endpoint answers at / and 404s at /mcp/.
    expect(mockFetch.mock.calls[0][0]).toBe("https://mcp.shamela.ws/");
  });

  it("JsonRpcMcpAdapter keeps appending /mcp/ for path-based bases", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", result: { tools: [] } }),
    });

    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "custom",
      name: "Custom",
      baseUrl: "https://example.com/api",
      transport: "json-rpc",
      description: "Custom",
    });

    await adapter.listTools();
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/api/mcp/");
  });

  it("skips providers that do not advertise resources or prompts", async () => {
    const registry = new ProviderRegistry([]);
    const tafsir = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir Suite",
    });
    const fihris = new JsonRpcMcpAdapter({
      id: "fihris",
      name: "Fihris",
      baseUrl: "https://search.waqf.app/api/mcp",
      transport: "json-rpc",
      description: "Search",
    });

    vi.spyOn(tafsir, "listResources").mockResolvedValue([
      { uri: "quran://surahs", name: "surahs_catalog" },
    ]);
    vi.spyOn(tafsir, "listPrompts").mockResolvedValue([
      { name: "study_ayah", description: "Ayah study template" },
    ]);
    const fihrisResources = vi.spyOn(fihris, "listResources");
    const fihrisPrompts = vi.spyOn(fihris, "listPrompts");

    registry.register(tafsir);
    registry.register(fihris);
    const router = new FederationRouter(registry);

    const resources = await router.listAllResources("all");
    expect(resources).toHaveLength(1);
    expect(fihrisResources).not.toHaveBeenCalled();

    const prompts = await router.listAllPrompts("all");
    expect(prompts).toHaveLength(1);
    expect(fihrisPrompts).not.toHaveBeenCalled();
  });

  it("FederationRouter federates and routes resources and prompts", async () => {
    const registry = new ProviderRegistry([]);

    const mockTafsir = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir Suite",
    });

    vi.spyOn(mockTafsir, "listResources").mockResolvedValue([
      { uri: "quran://surahs", name: "surahs_catalog" },
      { uri: "quran://tafsirs", name: "tafsirs_catalog" },
    ]);
    vi.spyOn(mockTafsir, "readResource").mockResolvedValue({
      contents: [{ uri: "quran://surahs", text: "surahs-json" }],
    });
    vi.spyOn(mockTafsir, "listPrompts").mockResolvedValue([
      { name: "study_ayah", description: "Ayah study template" },
    ]);
    vi.spyOn(mockTafsir, "getPrompt").mockResolvedValue({
      messages: [{ role: "user", content: { type: "text", text: "Analyze Surah 1 Ayah 1" } }],
    });

    registry.register(mockTafsir);

    const router = new FederationRouter(registry);

    const resources = await router.listAllResources("quran");
    expect(resources).toHaveLength(2);
    expect(resources.map((r) => r.uri)).toContain("quran://surahs");

    const read = await router.readResource("quran://surahs");
    expect(read.providerId).toBe("tafsir_net");
    expect(read.result.contents[0].text).toBe("surahs-json");

    const prompts = await router.listAllPrompts("all");
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("study_ayah");

    const promptRes = await router.getPrompt("study_ayah", { surah: "1", ayah: "1" });
    expect(promptRes.providerId).toBe("tafsir_net");
    expect(promptRes.result.messages[0].content).toEqual({
      type: "text",
      text: "Analyze Surah 1 Ayah 1",
    });
  });

  it("retries transient 503 once and succeeds on recovery", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers(),
        text: async () => "Temporarily unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: "recovered" }] },
        }),
      });
    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "turath",
      name: "Turath",
      baseUrl: "https://mcp.turath.io/mcp/",
      transport: "json-rpc",
      description: "Turath",
    });
    const res = await adapter.callTool("search_turath", { q: "test" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.isError).toBeUndefined();
    expect(res.content[0]).toEqual({ type: "text", text: "recovered" });
  });

  it("never retries HTTP 400 validation errors and classifies INVALID_ARGUMENT", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => "Bad request",
    });
    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "aljam3",
      name: "Aljam3",
      baseUrl: "https://aljam3.com/mcp",
      transport: "json-rpc",
      description: "Aljam3",
    });
    const res = await adapter.callTool("search", { q: "test" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.isError).toBe(true);
    expect(res.error?.code).toBe("INVALID_ARGUMENT");
    expect(res.error?.retryable).toBe(false);
  });

  it("maps HTTP 429 to RATE_LIMITED and opens the circuit breaker after 3 failures", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "0" }),
      text: async () => "Rate limit",
    });
    globalThis.fetch = mockFetch;

    const adapter = new JsonRpcMcpAdapter({
      id: "fihris",
      name: "Fihris",
      baseUrl: "https://search.waqf.app/api/mcp",
      transport: "json-rpc",
      description: "Fihris",
    });

    const registry = new ProviderRegistry([]);
    registry.register(adapter);
    const router = new FederationRouter(registry);

    for (let i = 0; i < 3; i++) {
      const r = await router.callTool("fihris__search_islamic_sources", { query: "zakat" });
      expect(r.result.isError).toBe(true);
      expect(r.result.error?.code).toBe("RATE_LIMITED");
      expect(r.result.error?.retryable).toBe(true);
    }

    const callsBeforeOpen = mockFetch.mock.calls.length;
    const fastFail = await router.callTool("fihris__search_islamic_sources", { query: "zakat" });
    expect(mockFetch.mock.calls.length).toBe(callsBeforeOpen);
    expect(fastFail.result.isError).toBe(true);
    expect(fastFail.result.error?.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("maps AbortError timeouts to UPSTREAM_TIMEOUT in router", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    const adapter = new JsonRpcMcpAdapter({
      id: "bahouth",
      name: "Bahouth",
      baseUrl: "https://bahouth.tafsir.net/mcp",
      transport: "json-rpc",
      description: "Bahouth",
    });
    const registry = new ProviderRegistry([]);
    registry.register(adapter);
    const router = new FederationRouter(registry);

    const res = await router.callTool("bahouth__get_verse", { verse_key: "1-1" });
    expect(res.result.isError).toBe(true);
    expect(res.result.error?.code).toBe("UPSTREAM_TIMEOUT");
    expect(res.result.error?.retryable).toBe(true);
  });
});
