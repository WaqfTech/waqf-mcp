import { describe, it, expect, vi } from "vitest";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { SseMcpAdapter } from "../src/adapters/sse";
import { ProviderRegistry } from "../src/core/registry";
import { FederationRouter } from "../src/core/router";

describe("MCP Adapters & Federation Router", () => {
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
});
