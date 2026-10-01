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
});
