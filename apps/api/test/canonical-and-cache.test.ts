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
      get: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "cached" }] }),
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
      get: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "cached" }] }),
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
  });
});

