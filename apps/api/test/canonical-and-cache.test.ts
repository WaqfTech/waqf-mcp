import { describe, it, expect, vi } from "vitest";
import { SchemaNormalizer } from "../src/core/normalizer";
import { FederationRouter } from "../src/core/router";
import { ProviderRegistry } from "../src/core/registry";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { SseMcpAdapter } from "../src/adapters/sse";
import { D1CacheService } from "../src/services/cache";

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

  it("D1CacheService computes deterministic SHA-256 keys", async () => {
    const fakeD1 = {} as D1Database;
    const cacheService = new D1CacheService(fakeD1);

    const key1 = await cacheService.computeKey("tafsir_net", "fetch_ayah", { surah_number: 2, ayah_number: 255 });
    const key2 = await cacheService.computeKey("tafsir_net", "fetch_ayah", { ayah_number: 255, surah_number: 2 });

    // Order of keys should not change the SHA-256 hash
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex is 64 characters
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
});

