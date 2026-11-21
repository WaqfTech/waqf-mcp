import { describe, it, expect, vi } from "vitest";
import { SchemaNormalizer } from "../src/core/normalizer";
import { FederationRouter, resetProviderWarnings } from "../src/core/router";
import { ProviderRegistry } from "../src/core/registry";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { SseMcpAdapter } from "../src/adapters/sse";
import {
  D1CacheService,
  INITIAL_CACHE_TTL_SECONDS,
  MAX_CACHE_PAYLOAD_BYTES,
  initialCacheTtl,
} from "../src/services/cache";

describe("Canonical Tools & Schema Normalization", () => {
  const normalizer = new SchemaNormalizer();

  it("translates Quran input to Bahouth and Tafsir formats", () => {
    const verseKey = normalizer.toBahouthVerseKey({ surah: 2, ayah: 255 });
    expect(verseKey).toBe("2-255");

    const tafsirArgs = normalizer.toTafsirNetAyahArgs({
      surah: 2,
      ayah: 255,
      includeTafsir: true,
    });
    expect(tafsirArgs).toEqual({
      surah: 2,
      ayah: 255,
      include: ["tadabbur", "gharib"],
    });
  });

  it("filters tools by suite query parameter", async () => {
    const registry = new ProviderRegistry([]);
    const router = new FederationRouter(registry, normalizer);

    const coreTools = await router.listAllTools("core");
    expect(coreTools.length).toBeGreaterThanOrEqual(3);
    expect(coreTools.every((t) => t.name.startsWith("waqf_"))).toBe(true);
  });

  it("warns once per provider when a suite listing drops an upstream, instead of shrinking silently", async () => {
    const registry = new ProviderRegistry([]);
    const healthy = new JsonRpcMcpAdapter({
      id: "bahouth",
      name: "Bahouth",
      baseUrl: "https://bahouth.tafsir.net/mcp",
      transport: "json-rpc",
      description: "Bahouth",
    });
    vi.spyOn(healthy, "listTools").mockResolvedValue([
      { name: "get_verse", description: "verse", inputSchema: { type: "object" } },
    ]);
    const blocked = new JsonRpcMcpAdapter({
      id: "fihris",
      name: "Fihris Islamic Web Search",
      baseUrl: "https://search.waqf.app/api/mcp",
      transport: "json-rpc",
      description: "Fihris Search",
    });
    vi.spyOn(blocked, "listTools").mockRejectedValue(new Error("zone challenge"));

    registry.register(healthy);
    registry.register(blocked);
    resetProviderWarnings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const router = new FederationRouter(registry, normalizer);

    const tools = await router.listAllTools("all");

    expect(tools.some((t) => t.name === "bahouth__get_verse")).toBe(true);
    expect(tools.some((t) => t.name.startsWith("fihris__"))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("fihris");

    await router.listAllTools("all");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("executes canonical waqf_quran_get_ayah routing through available provider", async () => {
    const registry = new ProviderRegistry([]);
    const mockTafsir = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir",
    });

    vi.spyOn(mockTafsir, "callTool").mockResolvedValue({
      content: [
        {
          type: "text",
          text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
        },
      ],
    });

    registry.register(mockTafsir);
    const router = new FederationRouter(registry, normalizer);

    const res = await router.callTool("waqf_quran_get_ayah", { surah: 2, ayah: 255 });
    expect(res.providerId).toBe("tafsir_net");
    expect(res.result.content[0].type).toBe("text");
    expect((res.result.content[0] as { text: string }).text).toContain("اللَّهُ لَا إِلَٰهَ");
  });

  it("caps the first TTL and keeps provider TTLs that are shorter", () => {
    expect(initialCacheTtl(604800)).toBe(INITIAL_CACHE_TTL_SECONDS);
    expect(initialCacheTtl(3600)).toBe(3600);
    expect(initialCacheTtl(0)).toBe(0);
  });

  it("skips caching payloads above the payload cap without touching D1", async () => {
    const prepare = vi.fn();
    const cache = new D1CacheService({ prepare } as unknown as D1Database);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await cache.set(
      "oversized-key",
      "turath",
      "get_book",
      { content: [{ type: "text", text: "x".repeat(MAX_CACHE_PAYLOAD_BYTES) }] },
      604800
    );

    expect(prepare).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("extends the cache TTL on a namespaced hit using the provider TTL", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = new JsonRpcMcpAdapter({
      id: "aljam3",
      name: "Aljam3 Library",
      baseUrl: "https://aljam3.com/mcp",
      transport: "json-rpc",
      description: "Aljam3 books corpus",
      cacheTtlSeconds: 604800,
    });
    registry.register(adapter);

    const cache = {
      computeKey: vi.fn().mockResolvedValue("cache-key"),
      get: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "cached" }],
        structuredContent: { schema_version: "1.0.0", status: "ok", results: [] },
      }),
      set: vi.fn(),
      recordHit: vi.fn().mockResolvedValue(undefined),
    } as unknown as D1CacheService;
    const router = new FederationRouter(registry, normalizer);

    const res = await router.callTool("aljam3__search", { query: "x" }, cache);

    expect(res.isCacheHit).toBe(true);
    expect(cache.recordHit).toHaveBeenCalledWith("cache-key", 604800);
  });

  it("extends the canonical cache TTL using the primary provider TTL", async () => {
    const registry = new ProviderRegistry([]);
    const tafsir = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir",
      cacheTtlSeconds: 2592000,
    });
    registry.register(tafsir);

    const cache = {
      computeKey: vi.fn().mockResolvedValue("cache-key"),
      get: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "cached" }],
        structuredContent: { schema_version: "1.0.0", status: "ok", results: [] },
      }),
      set: vi.fn(),
      recordHit: vi.fn().mockResolvedValue(undefined),
    } as unknown as D1CacheService;
    const router = new FederationRouter(registry, normalizer);

    const res = await router.callTool(
      "waqf_quran_get_ayah",
      { surah: 1, ayah: 1 },
      cache
    );

    expect(res.isCacheHit).toBe(true);
    expect(cache.recordHit).toHaveBeenCalledWith("cache-key", 2592000);
  });

  it("D1CacheService computes deterministic SHA-256 keys", async () => {
    const fakeD1 = {} as D1Database;
    const cacheService = new D1CacheService(fakeD1);

    const key1 = await cacheService.computeKey("tafsir_net", "fetch_ayah", { surah_number: 2, ayah_number: 255 });
    const key2 = await cacheService.computeKey("tafsir_net", "fetch_ayah", { ayah_number: 255, surah_number: 2 });

    // Order of keys should not change the SHA-256 hash
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex is 64 characters
  });

  it("router.isEmptyResult correctly detects empty tool results", () => {
    const registry = new ProviderRegistry([]);
    const router = new FederationRouter(registry, normalizer);

    expect(router.isEmptyResult({ content: [] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: "" }] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: "   " }] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: "[]" }] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: "{}" }] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: '{"result":[]}' }] })).toBe(true);
    expect(router.isEmptyResult({ content: [{ type: "text", text: '{"results":[]}' }] })).toBe(true);

    expect(router.isEmptyResult({ content: [{ type: "text", text: "Valid text content" }] })).toBe(false);
    expect(router.isEmptyResult({ content: [{ type: "text", text: '{"result":["item1"]}' }] })).toBe(false);
  });

  it("router does not cache empty tool results", async () => {
    const registry = new ProviderRegistry([]);
    const mockTafsir = new SseMcpAdapter({
      id: "tafsir_net",
      name: "Tafsir.net",
      baseUrl: "https://mcp.tafsir.net/mcp",
      transport: "sse",
      description: "Tafsir",
    });

    vi.spyOn(mockTafsir, "callTool").mockResolvedValue({
      content: [],
      isError: false,
    });

    registry.register(mockTafsir);
    const router = new FederationRouter(registry, normalizer);

    const fakeCache = {
      computeKey: vi.fn().mockResolvedValue("cache-key-123"),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      recordHit: vi.fn(),
    } as unknown as D1CacheService;

    await router.callTool("tafsir_net__search_quran_text", { query: "empty-query" }, fakeCache);

    expect(fakeCache.get).toHaveBeenCalledWith("cache-key-123");
    expect(fakeCache.set).not.toHaveBeenCalled();
  });

  describe("Provider Argument Sanitization", () => {
    it("normalizes colon-separated verse keys for Bahouth", () => {
      const sanitized = normalizer.sanitizeProviderArgs("bahouth", "get_verse", {
        verse_key: "112:1",
      });
      expect(sanitized.verse_key).toBe("112-1");
    });

    it("synthesizes verse_key from surah and ayah numbers for Bahouth", () => {
      const sanitized = normalizer.sanitizeProviderArgs("bahouth", "get_verse", {
        surah: 112,
        ayah: 1,
      });
      expect(sanitized.verse_key).toBe("112-1");
    });

    it("leaves non-Bahouth arguments untouched", () => {
      const raw = { surah_number: 2, ayah_number: 255 };
      const sanitized = normalizer.sanitizeProviderArgs("tafsir_net", "fetch_ayah", raw);
      expect(sanitized).toEqual(raw);
    });
  });

  describe("Canonical Fallback Routing", () => {
    it("falls back to Bahouth when Tafsir.net throws an error", async () => {
      const registry = new ProviderRegistry([]);

      const mockTafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir",
      });
      vi.spyOn(mockTafsir, "callTool").mockRejectedValue(new Error("Upstream 502 Bad Gateway"));

      const mockBahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });
      const bahouthSpy = vi.spyOn(mockBahouth, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: "قل هو الله أحد",
          },
        ],
      });

      registry.register(mockTafsir);
      registry.register(mockBahouth);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_quran_get_ayah", { surah: 112, ayah: 1 });
      expect(res.providerId).toBe("bahouth");
      expect(bahouthSpy).toHaveBeenCalledWith("get_verse", { verse_key: "112-1" });
      expect(res.result.content[0].type).toBe("text");
      expect((res.result.content[0] as { text: string }).text).toContain("قل هو الله أحد");
    });

    it("falls back to Bahouth when Tafsir.net returns isError: true", async () => {
      const registry = new ProviderRegistry([]);

      const mockTafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir",
      });
      vi.spyOn(mockTafsir, "callTool").mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "Rate limit exceeded" }],
      });

      const mockBahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });
      vi.spyOn(mockBahouth, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "قل هو الله أحد" }],
      });

      registry.register(mockTafsir);
      registry.register(mockBahouth);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_quran_get_ayah", { surah: 112, ayah: 1 });
      expect(res.providerId).toBe("bahouth");
    });

    it("sanitizes arguments when routing direct bahouth__* tools", async () => {
      const registry = new ProviderRegistry([]);

      const mockBahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });
      const bahouthSpy = vi.spyOn(mockBahouth, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "قل هو الله أحد" }],
      });

      registry.register(mockBahouth);
      const router = new FederationRouter(registry, normalizer);

      await router.callTool("bahouth__get_verse", { verse_key: "112:1" });
      expect(bahouthSpy).toHaveBeenCalledWith("get_verse", { verse_key: "112-1" });
    });

    it("routes waqf_search_scholarship through Fihris search provider", async () => {
      const registry = new ProviderRegistry([]);

      const mockFihris = new JsonRpcMcpAdapter({
        id: "fihris",
        name: "Fihris Islamic Web Search",
        baseUrl: "https://search.waqf.app/api/mcp",
        transport: "json-rpc",
        description: "Fihris Search",
      });
      const fihrisSpy = vi.spyOn(mockFihris, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "Found 10 results for الصلاة" }],
      });

      registry.register(mockFihris);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_search_scholarship", { query: "الصلاة" });
      expect(res.providerId).toBe("fihris");
      expect(fihrisSpy).toHaveBeenCalledWith("search_islamic_sources", { query: "الصلاة" });
      expect((res.result.content[0] as { text: string }).text).toContain("Found 10 results");
    });

    it("falls back to Turath when Fihris fails in waqf_search_scholarship", async () => {
      const registry = new ProviderRegistry([]);

      const mockFihris = new JsonRpcMcpAdapter({
        id: "fihris",
        name: "Fihris Islamic Web Search",
        baseUrl: "https://search.waqf.app/api/mcp",
        transport: "json-rpc",
        description: "Fihris Search",
      });
      vi.spyOn(mockFihris, "callTool").mockRejectedValue(new Error("Quota Exceeded (429)"));

      const mockTurath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io",
        transport: "json-rpc",
        description: "Turath Library",
      });
      const turathSpy = vi.spyOn(mockTurath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ count: 1, results: [{ text: "كتاب الصلاة" }] }) }],
      });

      registry.register(mockFihris);
      registry.register(mockTurath);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_search_scholarship", { query: "الصلاة" });
      expect(res.providerId).toBe("turath");
      expect(turathSpy).toHaveBeenCalledWith("search_turath", { q: "الصلاة" });
      expect((res.result.content[0] as { text: string }).text).toContain("كتاب الصلاة");
    });
  });

  describe("Fallback Fidelity", () => {
    function booksRegistry() {
      const registry = new ProviderRegistry([]);
      const aljam3 = new JsonRpcMcpAdapter({
        id: "aljam3",
        name: "Aljam3 Library",
        baseUrl: "https://aljam3.com/mcp",
        transport: "json-rpc",
        description: "Aljam3 books corpus",
      });
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io",
        transport: "json-rpc",
        description: "Turath Library",
      });
      registry.register(aljam3);
      registry.register(turath);
      return { registry, aljam3, turath };
    }

    function fakeCache() {
      return {
        computeKey: vi.fn().mockResolvedValue("cache-key"),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;
    }

    it("fails explicitly instead of answering a filtered books search from Turath", async () => {
      const { registry, aljam3, turath } = booksRegistry();
      vi.spyOn(aljam3, "callTool").mockRejectedValue(new Error("Aljam3 offline"));
      const turathSpy = vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "unfiltered result" }],
      });
      const cache = fakeCache();
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool(
        "waqf_books_search",
        { query: "test", bookId: 123, page: 2, limit: 1 },
        cache
      );

      const text = (res.result.content[0] as { text: string }).text;
      expect(res.result.isError).toBe(true);
      expect(text).toContain("Aljam3 books search is unavailable");
      expect(text).toContain("book_id");
      expect(text).toContain("page");
      expect(text).toContain("per_page");
      expect(turathSpy).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("serves an unfiltered books search from Turath without caching it as the primary answer", async () => {
      const { registry, aljam3, turath } = booksRegistry();
      vi.spyOn(aljam3, "callTool").mockRejectedValue(new Error("Aljam3 offline"));
      const turathSpy = vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "fallback result" }],
      });
      const cache = fakeCache();
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_books_search", { query: "test" }, cache);

      expect(turathSpy).toHaveBeenCalledWith("search_turath", { q: "test" });
      expect(res.providerId).toBe("turath");
      expect((res.result.content[0] as { text: string }).text).toContain("Books Fallback");
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("keeps caching a healthy Aljam3 books answer", async () => {
      const { registry, aljam3 } = booksRegistry();
      vi.spyOn(aljam3, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "aljam3 result" }],
      });
      const cache = fakeCache();
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_books_search", { query: "test", bookId: 123 }, cache);

      expect(res.providerId).toBe("aljam3");
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it("fails explicitly instead of answering a filtered scholarship search from Turath", async () => {
      const registry = new ProviderRegistry([]);
      const fihris = new JsonRpcMcpAdapter({
        id: "fihris",
        name: "Fihris Islamic Web Search",
        baseUrl: "https://search.waqf.app/api/mcp",
        transport: "json-rpc",
        description: "Fihris Search",
      });
      vi.spyOn(fihris, "callTool").mockRejectedValue(new Error("Quota Exceeded (429)"));
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io",
        transport: "json-rpc",
        description: "Turath Library",
      });
      const turathSpy = vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "unfiltered result" }],
      });
      registry.register(fihris);
      registry.register(turath);
      const cache = {
        computeKey: vi.fn().mockResolvedValue("cache-key"),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_search_scholarship", { query: "الصلاة", page: 2 }, cache);

      expect(res.result.isError).toBe(true);
      expect((res.result.content[0] as { text: string }).text).toContain("cannot honour page");
      expect(turathSpy).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe("Structured Content, Citations, and Pagination", () => {
    it("declares outputSchema on every canonical tool", () => {
      for (const tool of normalizer.getCanonicalToolDefinitions()) {
        expect(tool.outputSchema).toBeDefined();
        expect(tool.outputSchema?.type).toBe("object");
      }
    });

    it("preserves Uthmani text verbatim and keeps printed_page_label null when only digital page is known", () => {
      const registry = new ProviderRegistry([]);
      const aljam3 = new JsonRpcMcpAdapter({
        id: "aljam3",
        name: "Aljam3",
        baseUrl: "https://aljam3.com/mcp",
        transport: "json-rpc",
        description: "Aljam3",
      });
      const verbatimText = "قُلْ هُوَ ٱللَّهُ أَحَدٌ — نص قد يحتوي على أخطاء OCR";
      vi.spyOn(aljam3, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              file_id: 49852,
              page_number: 247,
              book_title: "صحيح البخاري",
              author: "البخاري",
              url: "https://aljam3.com/book/1/247",
              pdf_url: "https://aljam3.com/book/1.pdf#page=247",
              next_offset: 6000,
              text: verbatimText,
            }),
          },
        ],
      });
      registry.register(aljam3);
      const router = new FederationRouter(registry, normalizer);

      return router.callTool("waqf_books_read_page", { fileId: 49852, pageNumber: 247 }).then((res) => {
        const sc = res.result.structuredContent as {
          schema_version: string;
          status: string;
          results: Array<{
            content: { verbatim: string; ocr_status: string };
            location: { printed_page_label: string | null; digital_page_number: number | null; next_offset: number | null };
            citation: { source_url: string | null; pdf_url: string | null; citation_markdown: string | null };
          }>;
          pagination: { has_more: boolean; next_cursor: string | null };
        };
        expect(sc.schema_version).toBe("1.0.0");
        expect(sc.status).toBe("ok");
        expect(sc.results[0].content.verbatim).toBe(verbatimText);
        expect(sc.results[0].content.ocr_status).toBe("possible_ocr_errors");
        expect(sc.results[0].location.printed_page_label).toBeNull();
        expect(sc.results[0].location.digital_page_number).toBe(247);
        expect(sc.results[0].location.next_offset).toBe(6000);
        expect(sc.results[0].citation.pdf_url).toBe("https://aljam3.com/book/1.pdf#page=247");
        expect(sc.results[0].citation.citation_markdown).toContain("[صحيح البخاري (file p. 247)](https://aljam3.com/book/1/247)");
        expect(sc.pagination.has_more).toBe(true);
        expect(sc.pagination.next_cursor).toBe("6000");
      });
    });

    it("unwraps nested Aljam3 get_page {page, text, navigation} and Turath meta fields", async () => {
      const aljam3Normalized = normalizer.normalizeToolResult(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                page: {
                  id: 3547087,
                  file_id: 9025,
                  page_number: 3,
                  book: {
                    id: 3741,
                    title: "البناية شرح الهداية",
                    author: { id: 30865, name: "بدر الدين العيني" },
                  },
                  url: "https://aljam3.com/ar/3741/9025/3",
                  pdf_url: "https://example.com/03_74943.pdf#page=3",
                },
                text: { content: "باب صلاة المسافر", offset: 0, total_chars: 1999, next_offset: 201 },
                navigation: { previous_page: 2, next_page: 4 },
              }),
            },
          ],
        },
        "Aljam3 Library",
        { providerId: "aljam3", mode: "books_read_page" }
      );
      const aljam3Sc = aljam3Normalized.structuredContent as {
        results: Array<{
          kind: string;
          work: { id: string | null; title: string | null; author: string | null };
          location: {
            digital_page_number: number | null;
            file_id: number | null;
            page_id: string | null;
            offset: number | null;
            next_offset: number | null;
          };
          content: { verbatim: string; is_excerpt: boolean };
          citation: { source_url: string | null; pdf_url: string | null };
        }>;
        pagination: { has_more: boolean; next_cursor: string | null };
      };
      expect(aljam3Sc.results[0].kind).toBe("book_page");
      expect(aljam3Sc.results[0].work).toEqual({
        id: "3741",
        title: "البناية شرح الهداية",
        author: "بدر الدين العيني",
        edition: null,
      });
      expect(aljam3Sc.results[0].location.file_id).toBe(9025);
      expect(aljam3Sc.results[0].location.digital_page_number).toBe(3);
      expect(aljam3Sc.results[0].location.page_id).toBe("3547087");
      expect(aljam3Sc.results[0].location.offset).toBe(0);
      expect(aljam3Sc.results[0].location.next_offset).toBe(201);
      expect(aljam3Sc.results[0].content.verbatim).toBe("باب صلاة المسافر");
      expect(aljam3Sc.results[0].content.is_excerpt).toBe(true);
      expect(aljam3Sc.results[0].citation.pdf_url).toBe("https://example.com/03_74943.pdf#page=3");
      expect(aljam3Sc.pagination.has_more).toBe(true);
      expect(aljam3Sc.pagination.next_cursor).toBe("201");

      const turathNormalized = normalizer.normalizeToolResult(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: 1,
                results: [
                  {
                    book_id: 7696,
                    meta: {
                      book_name: "شرح زاد المستقنع",
                      author_name: "الشنقيطي",
                      page_id: 1252,
                      page: 2,
                      vol: "66",
                    },
                    text: "تابع أحكام صلاة المسافر",
                    link: "https://app.turath.io/book/7696?page=1252",
                  },
                ],
              }),
            },
          ],
        },
        "Turath",
        { providerId: "turath" }
      );
      const turathSc = turathNormalized.structuredContent as {
        results: Array<{
          work: { id: string | null; title: string | null; author: string | null };
          location: { volume_label: string | null; printed_page_label: string | null; page_id: string | null };
        }>;
      };
      expect(turathSc.results[0].work).toEqual({
        id: "7696",
        title: "شرح زاد المستقنع",
        author: "الشنقيطي",
        edition: null,
      });
      expect(turathSc.results[0].location.volume_label).toBe("66");
      expect(turathSc.results[0].location.printed_page_label).toBe("2");
      expect(turathSc.results[0].location.page_id).toBe("1252");

      const badQuran = await new FederationRouter(new ProviderRegistry([]), normalizer).callTool(
        "waqf_quran_get_ayah",
        { surah: 150, ayah: 1 }
      );
      expect(badQuran.result.isError).toBe(true);
      expect(badQuran.result.error?.code).toBe("INVALID_ARGUMENT");
    });

    it("enforces limit on waqf_hadith_search so oversized Turath responses are bounded", async () => {
      const registry = new ProviderRegistry([]);
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io/mcp/",
        transport: "json-rpc",
        description: "Turath",
      });
      const manyResults = Array.from({ length: 12 }, (_, idx) => ({
        book_id: idx + 1,
        title: `كتاب ${idx + 1}`,
        text: `نص الحديث رقم ${idx + 1}`,
      }));
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ count: 12, results: manyResults }) }],
      });
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_hadith_search", { query: "النية", limit: 3 });
      const sc = res.result.structuredContent as {
        results: Array<{ content: { verbatim: string } }>;
        pagination: { limit: number; total: number; has_more: boolean };
      };
      expect(sc.results).toHaveLength(3);
      expect(sc.results[0].content.verbatim).toBe("نص الحديث رقم 1");
      expect(sc.pagination.limit).toBe(3);
      expect(sc.pagination.total).toBe(12);
      expect(sc.pagination.has_more).toBe(true);
    });

    it("marks empty canonical results as no_results and skips caching", async () => {
      const registry = new ProviderRegistry([]);
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io/mcp/",
        transport: "json-rpc",
        description: "Turath",
      });
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ count: 0, results: [] }) }],
      });
      registry.register(turath);
      const cache = {
        computeKey: vi.fn().mockResolvedValue("cache-key"),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_hadith_search", { query: "nonexistent-xyz" }, cache);
      const sc = res.result.structuredContent as { status: string; results: unknown[] };
      expect(res.result.isError).toBeUndefined();
      expect(sc.status).toBe("no_results");
      expect(sc.results).toEqual([]);
      expect(router.isEmptyResult(res.result)).toBe(true);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("routes waqf_research_search concurrently across domain providers and preserves partial results", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = new JsonRpcMcpAdapter({
        id: "shamela",
        name: "Shamela",
        baseUrl: "https://mcp.shamela.ws",
        transport: "json-rpc",
        description: "Shamela",
      });
      const aljam3 = new JsonRpcMcpAdapter({
        id: "aljam3",
        name: "Aljam3",
        baseUrl: "https://aljam3.com/mcp",
        transport: "json-rpc",
        description: "Aljam3",
      });
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io/mcp/",
        transport: "json-rpc",
        description: "Turath",
      });

      vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                {
                  book_id: 10,
                  title: "المجموع",
                  printed_page: "6/12",
                  text: "زكاة الفطر طعمة",
                  url: "https://shamela.ws/book/10/12",
                },
              ],
            }),
          },
        ],
      });
      vi.spyOn(aljam3, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                {
                  book_id: 20,
                  title: "المجموع (طبعة أخرى)",
                  page_number: 15,
                  text: "زكاة الفطر طعمة",
                  url: "https://aljam3.com/book/20/15",
                },
              ],
            }),
          },
        ],
      });
      vi.spyOn(turath, "callTool").mockRejectedValue(new Error("Turath timed out"));

      registry.register(shamela);
      registry.register(aljam3);
      registry.register(turath);
      const cache = {
        computeKey: vi.fn().mockResolvedValue("federated-key"),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool(
        "waqf_research_search",
        { query: "زكاة الفطر", domain: "fiqh", max_results: 10 },
        cache
      );

      const sc = res.result.structuredContent as {
        status: string;
        results: Array<{ provider: string; work: { title: string } }>;
        warnings: string[];
        providers_queried: string[];
        providers_succeeded: string[];
        providers_failed: string[];
      };
      expect(sc.status).toBe("partial_results");
      // Same wording from two providers/editions must never be collapsed.
      expect(sc.results).toHaveLength(2);
      expect(sc.providers_queried).toEqual(["shamela", "aljam3", "turath"]);
      expect(sc.providers_succeeded).toEqual(["shamela", "aljam3"]);
      expect(sc.providers_failed).toEqual(["turath"]);
      expect(sc.warnings.some((w) => w.includes("turath"))).toBe(true);
      // Partial results are never cached as complete answers.
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("fails with SOURCE_UNAVAILABLE when all federated providers fail", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = new JsonRpcMcpAdapter({
        id: "shamela",
        name: "Shamela",
        baseUrl: "https://mcp.shamela.ws",
        transport: "json-rpc",
        description: "Shamela",
      });
      vi.spyOn(shamela, "callTool").mockRejectedValue(new Error("Upstream unreachable"));
      registry.register(shamela);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_research_search", {
        query: "الصلاة",
        providers: ["shamela"],
      });
      expect(res.result.isError).toBe(true);
      expect(res.result.error?.code).toBe("SOURCE_UNAVAILABLE");
    });

    it("rejects out-of-range ayah (1:99) immediately without calling Bahouth and handles found=false safely", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir.net",
      });
      const bahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });
      const tafsirSpy = vi.spyOn(tafsir, "callTool");
      const bahouthSpy = vi.spyOn(bahouth, "callTool");
      registry.register(tafsir);
      registry.register(bahouth);

      const router = new FederationRouter(registry, normalizer);
      const errRes = await router.callTool("waqf_quran_get_ayah", { surah: 1, ayah: 99 });
      expect(errRes.result.isError).toBe(true);
      expect(errRes.result.error?.code).toBe("INVALID_ARGUMENT");
      expect(tafsirSpy).not.toHaveBeenCalled();
      expect(bahouthSpy).not.toHaveBeenCalled();

      const emptyBahouth = normalizer.normalizeToolResult(
        { content: [{ type: "text", text: JSON.stringify({ found: false, verse: null }) }] },
        "Bahouth",
        { providerId: "bahouth", query: "1:99" }
      );
      const emptySc = emptyBahouth.structuredContent as { status: string; results: unknown[]; pagination: { total: number } };
      expect(emptySc.status).toBe("no_results");
      expect(emptySc.results).toEqual([]);
      expect(emptySc.pagination.total).toBe(0);
    });

    it("parses empty and populated Fihris Markdown into canonical web_result records", async () => {
      const registry = new ProviderRegistry([]);
      const fihris = new JsonRpcMcpAdapter({
        id: "fihris",
        name: "Fihris",
        baseUrl: "https://search.waqf.app/api/mcp",
        transport: "json-rpc",
        description: "Fihris",
      });
      const fihrisSpy = vi
        .spyOn(fihris, "callTool")
        .mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: 'No search results found for query: "xyzqwvnotarealfiqhterm" across indexed Islamic sources.',
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: [
                'Found 3980000 results for "أحكام الصلاة":',
                "",
                "### 1. [المختصر في أحكام الصلاة](https://www.alukah.net/sharia/0/43449/)",
                "*Source:* `www.alukah.net`",
                "",
                "مختصر أحكام الصلاة وشروطها.",
                "",
                "---",
                "",
                "### 2. [شروط الصلاة](https://binbaz.org.sa/audios/3006/)",
                "*Source:* `binbaz.org.sa`",
                "",
                "شرح شروط الصلاة وأركانها.",
              ].join("\n"),
            },
          ],
        });
      registry.register(fihris);
      const router = new FederationRouter(registry, normalizer);

      const emptyRes = await router.callTool("waqf_search_scholarship", { query: "xyzqwvnotarealfiqhterm" });
      const emptySc = emptyRes.result.structuredContent as {
        status: string;
        results: unknown[];
        pagination: { total: number; has_more: boolean };
      };
      expect(emptySc.status).toBe("no_results");
      expect(emptySc.results).toEqual([]);
      expect(emptySc.pagination.total).toBe(0);
      expect(emptySc.pagination.has_more).toBe(false);

      const popRes = await router.callTool("waqf_search_scholarship", { query: "أحكام الصلاة" });
      expect(fihrisSpy).toHaveBeenCalledTimes(2);
      const popSc = popRes.result.structuredContent as {
        status: string;
        results: Array<{
          kind: string;
          work: { title: string | null };
          content: { verbatim: string; is_excerpt: boolean };
          citation: { source_url: string | null; citation_markdown: string | null };
        }>;
        pagination: { total: number };
      };
      expect(popSc.status).toBe("ok");
      expect(popSc.results).toHaveLength(2);
      expect(popSc.pagination.total).toBe(3980000);
      expect(popSc.results[0].kind).toBe("web_result");
      expect(popSc.results[0].work.title).toBe("المختصر في أحكام الصلاة");
      expect(popSc.results[0].citation.source_url).toBe("https://www.alukah.net/sharia/0/43449/");
      expect(popSc.results[0].citation.citation_markdown).toBe(
        "[المختصر في أحكام الصلاة](https://www.alukah.net/sharia/0/43449/)"
      );
      expect(popSc.results[0].content.verbatim).toBe("مختصر أحكام الصلاة وشروطها.");
    });

    it("bypasses stale pre-v1 cache entries lacking structuredContent and strips _display from Tafsir.net", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir.net",
      });
      vi.spyOn(tafsir, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              surah: 1,
              ayah: 1,
              text_uthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
              _display: "Display instructions to strip",
            }),
          },
        ],
      });
      registry.register(tafsir);

      const cache = {
        computeKey: vi.fn().mockResolvedValue("stale-key"),
        get: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "[Source: Tafsir.net]\n{}" }],
        }),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;

      const router = new FederationRouter(registry, normalizer);
      const res = await router.callTool("waqf_quran_get_ayah", { surah: 1, ayah: 1 }, cache);
      expect(res.isCacheHit).toBe(false);
      expect(res.result.structuredContent).toBeDefined();
      expect((res.result.content[0] as { text: string }).text).not.toContain("_display");
      expect((res.result.content[0] as { text: string }).text).toContain("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ");
      expect(cache.set).toHaveBeenCalled();

      const namespaced = await router.callTool("tafsir_net__fetch_ayah", { surah: 1, ayah: 1 });
      expect((namespaced.result.content[0] as { text: string }).text).not.toContain("_display");
    });

    it("cleans 38+ claims and enriches missing upstream schema descriptions in tools/list", async () => {
      const registry = new ProviderRegistry([]);
      const fihris = new JsonRpcMcpAdapter({
        id: "fihris",
        name: "Fihris",
        baseUrl: "https://search.waqf.app/api/mcp",
        transport: "json-rpc",
        description: "Fihris",
      });
      const bahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });
      const tafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir.net",
      });
      vi.spyOn(fihris, "listTools").mockResolvedValue([
        { name: "search_islamic_sources", description: "Search across 38+ portals", inputSchema: { type: "object", properties: {} } },
      ]);
      vi.spyOn(bahouth, "listTools").mockResolvedValue([
        { name: "find_root", description: "Find root", inputSchema: { type: "object", properties: { root_text: { type: "string" } } } },
      ]);
      vi.spyOn(tafsir, "listTools").mockResolvedValue([
        { name: "search_quran_text", description: "بحث نصي", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
      ]);
      registry.register(fihris);
      registry.register(bahouth);
      registry.register(tafsir);

      const tools = await new FederationRouter(registry, normalizer).listAllTools("all");
      const fihrisTool = tools.find((t) => t.name === "fihris__search_islamic_sources");
      const bahouthTool = tools.find((t) => t.name === "bahouth__find_root");
      const tafsirTool = tools.find((t) => t.name === "tafsir_net__search_quran_text");
      expect(fihrisTool?.description).not.toContain("38+");
      expect((bahouthTool?.inputSchema.properties as Record<string, { description?: string }>).root_text.description).toBeTruthy();
      expect((tafsirTool?.inputSchema.properties as Record<string, { description?: string }>).query.description).toContain("FTS5");
    });

    it("prioritizes primary Hadith collections (cat_id 6) on waqf_hadith_search with fallback and maps categories -> cats", async () => {
      const registry = new ProviderRegistry([]);
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io/mcp/",
        transport: "json-rpc",
        description: "Turath",
      });
      const turathSpy = vi
        .spyOn(turath, "callTool")
        .mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: 1,
                results: [{ book_id: 1, meta: { book_name: "صحيح البخاري" }, text: "إنما الأعمال" }],
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify({ count: 0, results: [] }) }],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: 1,
                results: [{ book_id: 2, meta: { book_name: "شرح حديث" }, text: "شرح" }],
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify({ count: 0, results: [] }) }],
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify({ cats: [{ id: 6, name: "كتب السنة" }] }) }],
        });
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      await router.callTool("waqf_hadith_search", { query: "إنما الأعمال" });
      expect(turathSpy).toHaveBeenNthCalledWith(1, "search_turath", {
        q: "إنما الأعمال",
        cat_id: [6],
      });

      const broadened = await router.callTool("waqf_hadith_search", { query: "عبارة نادرة" });
      expect(turathSpy).toHaveBeenNthCalledWith(2, "search_turath", {
        q: "عبارة نادرة",
        cat_id: [6],
      });
      expect(turathSpy).toHaveBeenNthCalledWith(3, "search_turath", {
        q: "عبارة نادرة",
      });
      expect(
        ((broadened.result.structuredContent as { warnings: string[] }).warnings || [])[0]
      ).toContain("cat_id 6");

      await router.callTool("waqf_hadith_search", {
        query: "النية",
        scope: "commentaries",
      });
      expect(turathSpy).toHaveBeenNthCalledWith(4, "search_turath", {
        q: "النية",
        cat_id: [6, 7],
      });

      await router.callTool("waqf_turath_search_books", {
        query: "الحديث",
        kind: "categories",
      });
      expect(turathSpy).toHaveBeenNthCalledWith(5, "discover_turath", {
        q: "الحديث",
        kind: "cats",
      });
    });

    it("keeps all canonical tool definitions compliant across OpenAI, Gemini, Claude, and Grok", () => {
      const tools = normalizer.getCanonicalToolDefinitions();
      expect(tools).toHaveLength(8);
      const serialized = JSON.stringify(tools);
      // OpenAI custom MCP UI enforces <5000 tokens across tool definitions.
      expect(serialized.length).toBeLessThan(15000);
      expect(serialized).not.toContain('"oneOf"');
      expect(serialized).not.toContain('"anyOf"');
      expect(serialized).not.toContain('"allOf"');
      expect(serialized).not.toContain('"const"');

      const findTypeArray = (node: unknown): boolean => {
        if (!node || typeof node !== "object") return false;
        if (Array.isArray(node)) return node.some(findTypeArray);
        const rec = node as Record<string, unknown>;
        if (Array.isArray(rec.type)) return true;
        return Object.values(rec).some(findTypeArray);
      };

      for (const tool of tools) {
        expect(tool.title && tool.title.trim().length > 0).toBe(true);
        expect(tool.name.length).toBeLessThanOrEqual(64);
        expect(tool.annotations?.readOnlyHint).toBe(true);
        expect(tool.annotations?.destructiveHint).toBe(false);
        expect(typeof tool.annotations?.openWorldHint).toBe("boolean");
        expect(findTypeArray(tool.inputSchema)).toBe(false);
        expect(findTypeArray(tool.outputSchema)).toBe(false);
      }
    });

    it("supports waqf_quran_search in text mode, root mode with Bahouth fallback, and validation errors", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = new SseMcpAdapter({
        id: "tafsir_net",
        name: "Tafsir.net",
        baseUrl: "https://mcp.tafsir.net/mcp",
        transport: "sse",
        description: "Tafsir",
      });
      const bahouth = new JsonRpcMcpAdapter({
        id: "bahouth",
        name: "Bahouth",
        baseUrl: "https://bahouth.tafsir.net/mcp",
        transport: "json-rpc",
        description: "Bahouth",
      });

      const tafsirSpy = vi
        .spyOn(tafsir, "callTool")
        .mockResolvedValueOnce({
          content: [
            { type: "text", text: JSON.stringify({ surah: 4, ayah: 103, text: "فإذا قضيتم الصلاة" }) },
            { type: "text", text: JSON.stringify({ surah: 4, ayah: 43, text: "لا تقربوا الصلاة" }) },
          ],
          structuredContent: {
            result: [
              { surah: 4, ayah: 103, text: "فإذا قضيتم الصلاة" },
              { surah: 4, ayah: 43, text: "لا تقربوا الصلاة" },
            ],
          },
        })
        .mockRejectedValueOnce(new Error("Tafsir root endpoint unavailable"));

      const bahouthSpy = vi.spyOn(bahouth, "callTool").mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              root_text: "كتب",
              verses: [
                {
                  verse_id: 9,
                  surah_id: 2,
                  ayah_number: 2,
                  verse_key: "2-2",
                  text_raw: "ذَلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ",
                },
              ],
            }),
          },
        ],
      });

      registry.register(tafsir);
      registry.register(bahouth);
      const router = new FederationRouter(registry, normalizer);

      const textRes = await router.callTool("waqf_quran_search", {
        query: "الصلاة",
        mode: "text",
        surah: 4,
        limit: 10,
      });
      expect(tafsirSpy).toHaveBeenNthCalledWith(1, "search_quran_text", {
        query: "الصلاة",
        limit: 10,
        surah_filter: [4],
      });
      const textSc = textRes.result.structuredContent as {
        status: string;
        results: Array<{ kind: string; location: { page_id: string | null }; content: { verbatim: string } }>;
      };
      expect(textSc.status).toBe("ok");
      expect(textSc.results).toHaveLength(2);
      expect(textSc.results[0].kind).toBe("quran_ayah");
      expect(textSc.results[0].location.page_id).toBe("4:103");

      const rootRes = await router.callTool("waqf_quran_search", {
        query: "كتب",
        mode: "root",
        limit: 5,
      });
      expect(bahouthSpy).toHaveBeenCalledWith("list_root_verses", {
        root_text: "كتب",
        limit: 5,
        offset: 0,
      });
      expect(rootRes.providerId).toBe("bahouth");
      const rootSc = rootRes.result.structuredContent as {
        warnings: string[];
        results: Array<{ content: { verbatim: string }; location: { page_id: string | null } }>;
      };
      expect(rootSc.results[0].content.verbatim).toBe("ذَلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ");
      expect(rootSc.results[0].location.page_id).toBe("2-2");
      expect(rootSc.warnings[0]).toContain("Bahouth fallback");

      const badSurah = await router.callTool("waqf_quran_search", {
        query: "الصلاة",
        surah: 200,
      });
      expect(badSurah.result.isError).toBe(true);
      expect(badSurah.result.error?.code).toBe("INVALID_ARGUMENT");

      const badMode = await router.callTool("waqf_quran_search", {
        query: "الصلاة",
        mode: "semantic",
      });
      expect(badMode.result.isError).toBe(true);
      expect(badMode.result.error?.code).toBe("INVALID_ARGUMENT");
    });

    it("routes waqf_books_read_page across aljam3, turath, and shamela with distinct cache keys", async () => {
      const registry = new ProviderRegistry([]);
      const aljam3 = new JsonRpcMcpAdapter({
        id: "aljam3",
        name: "Aljam3",
        baseUrl: "https://aljam3.com/mcp",
        transport: "json-rpc",
        description: "Aljam3",
      });
      const turath = new JsonRpcMcpAdapter({
        id: "turath",
        name: "Turath",
        baseUrl: "https://mcp.turath.io/mcp/",
        transport: "json-rpc",
        description: "Turath",
      });
      const shamela = new JsonRpcMcpAdapter({
        id: "shamela",
        name: "Shamela",
        baseUrl: "https://mcp.shamela.ws",
        transport: "json-rpc",
        description: "Shamela",
      });

      const aljam3Spy = vi.spyOn(aljam3, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ file_id: 5, page_number: 1, text: "صفحة الجامع" }) }],
      });
      const turathSpy = vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ book_id: 2051, page_id: 1203, text: "صفحة التراث" }) }],
      });
      const shamelaSpy = vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              book_id: 5,
              page_id: 1,
              text: "صفحة الشاملة",
              citation: { markdown: "[المدونة (1/ 207)](https://shamela.ws/book/5/1)" },
              next_cursor: "cur-2",
            }),
          },
        ],
      });

      registry.register(aljam3);
      registry.register(turath);
      registry.register(shamela);

      const cache = {
        computeKey: vi.fn((provider: string, tool: string, a: Record<string, unknown>) =>
          Promise.resolve(`${provider}:${tool}:${JSON.stringify(a)}`)
        ),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        recordHit: vi.fn(),
      } as unknown as D1CacheService;

      const router = new FederationRouter(registry, normalizer);

      const aljam3Res = await router.callTool("waqf_books_read_page", { fileId: 5, pageNumber: 1 }, cache);
      expect(aljam3Spy).toHaveBeenCalledWith("get_page", { file_id: 5, page_number: 1 });
      expect(aljam3Res.providerId).toBe("aljam3");

      const turathRes = await router.callTool(
        "waqf_books_read_page",
        { provider: "turath", bookId: 2051, pageId: 1203 },
        cache
      );
      expect(turathSpy).toHaveBeenCalledWith("get_page", { book_id: 2051, page_id: 1203 });
      expect(turathRes.providerId).toBe("turath");
      expect((turathRes.result.structuredContent as { results: Array<{ kind: string }> }).results[0].kind).toBe(
        "book_page"
      );

      const shamelaRes = await router.callTool(
        "waqf_books_read_page",
        { provider: "shamela", bookId: 5, pageId: 1 },
        cache
      );
      expect(shamelaSpy).toHaveBeenCalledWith("shamela_open", {
        book_id: 5,
        page_id: 1,
        max_chars: 3500,
      });
      const shamelaSc = shamelaRes.result.structuredContent as {
        results: Array<{
          kind: string;
          work: { title: string | null };
          citation: { source_url: string | null; verification_status: string };
        }>;
        pagination: { has_more: boolean; next_cursor: string | null };
      };
      expect(shamelaSc.results[0].kind).toBe("book_page");
      expect(shamelaSc.results[0].work.title).toBe("المدونة");
      expect(shamelaSc.results[0].citation.source_url).toBe("https://shamela.ws/book/5/1");
      expect(shamelaSc.results[0].citation.verification_status).toBe("resolved");
      expect(shamelaSc.pagination.has_more).toBe(true);
      expect(shamelaSc.pagination.next_cursor).toBe("cur-2");

      const keys = (cache.computeKey as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.stringify(c[2]));
      expect(keys[0]).not.toBe(keys[2]);

      const badProvider = await router.callTool("waqf_books_read_page", {
        provider: "unknown_lib",
        bookId: 1,
        pageId: 1,
      });
      expect(badProvider.result.isError).toBe(true);
      expect(badProvider.result.error?.code).toBe("INVALID_ARGUMENT");

      const missingIds = await router.callTool("waqf_books_read_page", { provider: "turath" });
      expect(missingIds.result.isError).toBe(true);
      expect(missingIds.result.error?.code).toBe("INVALID_ARGUMENT");
    });

    it("routes waqf_research_search automatically when providers is [] and trims oversized multi-item payloads", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = new JsonRpcMcpAdapter({
        id: "shamela",
        name: "Shamela",
        baseUrl: "https://mcp.shamela.ws",
        transport: "json-rpc",
        description: "Shamela",
      });
      const bigText = "أ".repeat(3500);
      vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: Array.from({ length: 5 }, (_, i) => ({
                book_id: i + 1,
                title: `كتاب ${i + 1}`,
                text: bigText,
                url: `https://shamela.ws/book/${i + 1}/1`,
              })),
            }),
          },
        ],
      });
      registry.register(shamela);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_research_search", {
        query: "الصلاة",
        domain: "hadith",
        providers: [],
      });
      const bytes = new TextEncoder().encode(JSON.stringify(res.result)).length;
      expect(bytes).toBeLessThanOrEqual(16500);
      const sc = res.result.structuredContent as {
        status: string;
        results: unknown[];
        pagination: { has_more: boolean };
        warnings: string[];
      };
      expect(sc.status).toBe("ok");
      expect(sc.results.length).toBeGreaterThanOrEqual(1);
      expect(sc.results.length).toBeLessThan(5);
      expect(sc.pagination.has_more).toBe(true);
      expect(sc.warnings.some((w) => w.includes("18 KB"))).toBe(true);
    });
  });
});

