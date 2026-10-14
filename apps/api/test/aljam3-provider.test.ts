import { describe, it, expect, vi } from "vitest";
import { PROVIDER_CATALOG, getProviderCatalogEntry } from "@waqf/types";
import { SchemaNormalizer } from "../src/core/normalizer";
import { FederationRouter } from "../src/core/router";
import { ProviderRegistry } from "../src/core/registry";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { D1CacheService } from "../src/services/cache";

const aljam3Config = getProviderCatalogEntry("aljam3");

function createAdapter() {
  return new JsonRpcMcpAdapter({
    id: aljam3Config.id,
    name: aljam3Config.displayName,
    baseUrl: aljam3Config.upstreamUrl,
    transport: aljam3Config.upstreamTransport,
    description: aljam3Config.summary,
    cacheTtlSeconds: aljam3Config.cacheTtlSeconds,
  });
}

describe("Aljam3 provider normalization", () => {
  const normalizer = new SchemaNormalizer();

  it("maps loose argument names onto the upstream schema", () => {
    expect(normalizer.toAljam3Args("search", { query: "النية" })).toEqual({ q: "النية" });
    expect(normalizer.toAljam3Args("search", { q: "النية", limit: 10 })).toEqual({
      q: "النية",
      per_page: 10,
    });
    expect(normalizer.toAljam3Args("list_books", { authorId: 112 })).toEqual({ author_id: 112 });
    expect(normalizer.toAljam3Args("get_book", { book_id: 22661 })).toEqual({ id: 22661 });
    expect(normalizer.toAljam3Args("get_page", { fileId: 49852, pageNumber: 3 })).toEqual({
      file_id: 49852,
      page_number: 3,
    });
  });

  it("drops unknown keys, because upstream rejects additional properties", () => {
    const sanitized = normalizer.toAljam3Args("search", {
      query: "النية",
      catalog: true,
      expand: ["files"],
      verse_key: "2:255",
    });
    expect(sanitized).toEqual({ q: "النية" });
  });

  it("enforces upstream bounds", () => {
    expect(normalizer.toAljam3Args("search", { query: "q", limit: 250 })).toEqual({
      q: "q",
      per_page: 20,
    });
    expect(normalizer.toAljam3Args("search", { query: "q", page: 900 })).toEqual({
      q: "q",
      page: 100,
    });
    expect(normalizer.toAljam3Args("get_page", { fileId: 1, pageNumber: 2, maxChars: 99999 })).toEqual({
      file_id: 1,
      page_number: 2,
      max_chars: 12000,
    });
    expect(String(normalizer.toAljam3Args("search", { query: "ن".repeat(600) }).q)).toHaveLength(500);
  });

  it("keeps only the first entry of collection filters", () => {
    expect(normalizer.toAljam3Args("search", { query: "q", categories: [5, 6] })).toEqual({
      q: "q",
      category_id: 5,
    });
    expect(normalizer.toAljam3Args("search", { query: "q", categories: [] })).toEqual({ q: "q" });
  });

  it("is applied to namespaced calls through sanitizeProviderArgs", () => {
    expect(normalizer.sanitizeProviderArgs("aljam3", "search", { query: "فقه", limit: 40 })).toEqual({
      q: "فقه",
      per_page: 20,
    });
    // Other providers keep their arguments untouched
    expect(normalizer.sanitizeProviderArgs("turath", "search_turath", { query: "فقه" })).toEqual({
      query: "فقه",
    });
  });
});

describe("Aljam3 canonical routing", () => {
  const normalizer = new SchemaNormalizer();

  it("routes waqf_books_search to the Aljam3 search tool", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    const callTool = vi.spyOn(adapter, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "نتائج البحث" }],
    });
    registry.register(adapter);

    const router = new FederationRouter(registry, normalizer);
    const res = await router.callTool("waqf_books_search", { query: "النية", limit: 3 });

    expect(callTool).toHaveBeenCalledWith("search", { q: "النية", per_page: 3 });
    expect(res.providerId).toBe("aljam3");
    expect(res.result.content[0]).toEqual({
      type: "text",
      text: "[Source: Aljam3 Library]\nنتائج البحث",
    });
  });

  it("routes waqf_books_read_page with an offset for continuation", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    const callTool = vi.spyOn(adapter, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "نص الصفحة" }],
    });
    registry.register(adapter);

    const router = new FederationRouter(registry, normalizer);
    const res = await router.callTool("waqf_books_read_page", {
      fileId: 49852,
      pageNumber: 3,
      offset: 6000,
    });

    expect(callTool).toHaveBeenCalledWith("get_page", {
      file_id: 49852,
      page_number: 3,
      offset: 6000,
    });
    expect(res.providerId).toBe("aljam3");
  });

  it("falls back to Turath when the books upstream fails", async () => {
    const registry = new ProviderRegistry([]);

    const aljam3 = createAdapter();
    vi.spyOn(aljam3, "callTool").mockRejectedValue(new Error("upstream down"));
    registry.register(aljam3);

    const turath = new JsonRpcMcpAdapter({
      id: "turath",
      name: "Turath",
      baseUrl: "https://mcp.turath.io/mcp/",
      transport: "json-rpc",
      description: "Turath",
    });
    const turathCall = vi.spyOn(turath, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "نسخة تراث" }],
    });
    registry.register(turath);

    const router = new FederationRouter(registry, normalizer);
    const res = await router.callTool("waqf_books_search", { query: "النية" });

    expect(turathCall).toHaveBeenCalledWith("search_turath", { q: "النية" });
    expect(res.providerId).toBe("turath");
  });

  it("lists Aljam3 tools in the heritage suite", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    vi.spyOn(adapter, "listTools").mockResolvedValue(
      aljam3Config.tools.map((name) => ({ name, inputSchema: { type: "object" } }))
    );
    registry.register(adapter);

    const router = new FederationRouter(registry, normalizer);
    const tools = await router.listAllTools("turath");
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("aljam3__search");
    expect(names).toContain("aljam3__get_page");
    expect(names).toContain("waqf_books_search");
    expect(names).toContain("waqf_books_read_page");
    // Aljam3 is not part of the Quran suite
    const quranNames = (await router.listAllTools("quran")).map((tool) => tool.name);
    expect(quranNames.some((name) => name.startsWith("aljam3__"))).toBe(false);
  });

  it("keeps the catalog entry in sync with the registered provider", () => {
    expect(PROVIDER_CATALOG.map((entry) => entry.id)).toContain("aljam3");
    expect(aljam3Config.upstreamUrl).toBe("https://aljam3.com/mcp");
    expect(aljam3Config.cacheTtlSeconds).toBe(604800);
    expect(aljam3Config.tools).toHaveLength(7);
  });
});

describe("Aljam3 numeric argument coercion", () => {
  const normalizer = new SchemaNormalizer();

  it("coerces numeric strings into the integer-typed upstream schema", () => {
    expect(normalizer.toAljam3Args("search", { query: "q", limit: "12" })).toEqual({
      q: "q",
      per_page: 12,
    });
    expect(normalizer.toAljam3Args("search", { query: "q", author_id: "112", categories: ["5", "6"] })).toEqual({
      q: "q",
      author_id: 112,
      category_id: 5,
    });
    expect(
      normalizer.toAljam3Args("get_page", { fileId: "49852", pageNumber: "3", maxChars: "12000" })
    ).toEqual({ file_id: 49852, page_number: 3, max_chars: 12000 });
  });

  it("drops non-numeric strings so upstream defaults apply instead of a 400", () => {
    expect(normalizer.toAljam3Args("search", { query: "q", limit: "many" })).toEqual({ q: "q" });
    expect(normalizer.toAljam3Args("search", { query: "q", book_id: "" })).toEqual({ q: "q" });
  });
});

describe("Canonical books cache keys", () => {
  it("shares one entry across equivalent argument spellings", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    vi.spyOn(adapter, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "passage" }],
    });
    registry.register(adapter);

    // computeKey only needs SHA-256, so a stub D1 is enough to observe the keys;
    // get/set are stubbed to keep the deliberate D1 failures out of the output.
    const cache = new D1CacheService({} as D1Database);
    vi.spyOn(cache, "get").mockResolvedValue(null);
    vi.spyOn(cache, "set").mockResolvedValue(undefined);
    const computeKey = vi.spyOn(cache, "computeKey");
    const router = new FederationRouter(registry, new SchemaNormalizer());

    await router.callTool("waqf_books_search", { query: "x", limit: 3 }, cache);
    await router.callTool("waqf_books_search", { query: "x", per_page: 3 }, cache);

    const [firstArgs, secondArgs] = computeKey.mock.calls.map((call) => call[2]);
    expect(firstArgs).toEqual(secondArgs);
    expect(await cache.computeKey("canonical", "waqf_books_search", firstArgs)).toBe(
      await cache.computeKey("canonical", "waqf_books_search", secondArgs)
    );
  });
});
