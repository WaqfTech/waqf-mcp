import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaNormalizer } from "../src/core/normalizer";
import { FederationRouter } from "../src/core/router";
import { ProviderRegistry } from "../src/core/registry";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";
import { SseMcpAdapter } from "../src/adapters/sse";
import { resetCircuitBreakers } from "../src/adapters/base";
import type { D1CacheService } from "../src/services/cache";

function makeJsonAdapter(id: string, name: string, baseUrl: string) {
  return new JsonRpcMcpAdapter({
    id,
    name,
    baseUrl,
    transport: "json-rpc",
    description: name,
  });
}

function makeSseAdapter(id: string, name: string, baseUrl: string) {
  return new SseMcpAdapter({
    id,
    name,
    baseUrl,
    transport: "sse",
    description: name,
  });
}

function makeNoopCache(): D1CacheService {
  return {
    computeKey: vi.fn().mockResolvedValue("golden-key"),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    recordHit: vi.fn(),
  } as unknown as D1CacheService;
}

describe("Golden Evidence & Scholarly Integrity Regression Suite", () => {
  const normalizer = new SchemaNormalizer();

  beforeEach(() => {
    resetCircuitBreakers();
  });

  describe("1. Quranic Orthography Preservation", () => {
    const uthmaniFixtures = [
      { surah: 1, ayah: 1, label: "Basmala", text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" },
      { surah: 2, ayah: 255, label: "Ayat al-Kursi", text: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ" },
      { surah: 112, ayah: 1, label: "Al-Ikhlas", text: "قُلْ هُوَ ٱللَّهُ أَحَدٌ" },
      { surah: 18, ayah: 10, label: "Al-Kahf hamza", text: "رَبَّنَآ ءَاتِنَا مِن لَّدُنكَ رَحْمَةً" },
    ];

    it.each(uthmaniFixtures)(
      "preserves Uthmani orthography byte-for-byte for $label ($surah:$ayah)",
      async ({ surah, ayah, text }) => {
        const registry = new ProviderRegistry([]);
        const tafsir = makeSseAdapter("tafsir_net", "Tafsir.net", "https://mcp.tafsir.net/mcp");
        vi.spyOn(tafsir, "callTool").mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                surah,
                ayah,
                text_uthmani: text,
                text_simple: "simplified-ignored-for-verbatim",
              }),
            },
          ],
        });
        registry.register(tafsir);
        const router = new FederationRouter(registry, normalizer);

        const res = await router.callTool("waqf_quran_get_ayah", { surah, ayah });
        const sc = res.result.structuredContent as {
          results: Array<{ kind: string; content: { verbatim: string } }>;
        };
        expect(sc.results[0].kind).toBe("quran_ayah");
        expect(sc.results[0].content.verbatim).toBe(text);
      }
    );

    it("falls back to Bahouth without altering Uthmani text and records warning", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = makeSseAdapter("tafsir_net", "Tafsir.net", "https://mcp.tafsir.net/mcp");
      const bahouth = makeJsonAdapter("bahouth", "Bahouth", "https://bahouth.tafsir.net/mcp");
      vi.spyOn(tafsir, "callTool").mockRejectedValue(new Error("timeout"));
      const verbatim = "قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ";
      vi.spyOn(bahouth, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ verse_key: "113-1", text_uthmani: verbatim }) }],
      });
      registry.register(tafsir);
      registry.register(bahouth);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_quran_get_ayah", { surah: 113, ayah: 1 });
      const sc = res.result.structuredContent as {
        warnings: string[];
        results: Array<{ provider: string; content: { verbatim: string } }>;
      };
      expect(sc.results[0].provider).toBe("bahouth");
      expect(sc.results[0].content.verbatim).toBe(verbatim);
      expect(sc.warnings.some((w) => w.includes("Bahouth fallback"))).toBe(true);
    });

    it("never computes synthetic confidence scores on Quranic results", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = makeSseAdapter("tafsir_net", "Tafsir.net", "https://mcp.tafsir.net/mcp");
      vi.spyOn(tafsir, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ surah: 1, ayah: 2, text_uthmani: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" }) }],
      });
      registry.register(tafsir);
      const router = new FederationRouter(registry, normalizer);
      const res = await router.callTool("waqf_quran_get_ayah", { surah: 1, ayah: 2 });
      const serialized = JSON.stringify(res.result.structuredContent);
      expect(serialized).not.toContain('"confidence"');
    });
  });

  describe("2. Tafsir Attribution & Verbatim Integrity", () => {
    it("preserves footnote markers {[1]} and critical apparatus verbatim inside tafsir output", async () => {
      const registry = new ProviderRegistry([]);
      const tafsir = makeSseAdapter("tafsir_net", "Tafsir.net", "https://mcp.tafsir.net/mcp");
      const rawCommentary = "تفسير سورة الناس {[1]} وفي رواية أخرى ¬كذا في الأصل¥";
      vi.spyOn(tafsir, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({ surah: 114, ayah: 1, text_uthmani: "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ", gharib: rawCommentary }),
          },
        ],
      });
      registry.register(tafsir);
      const router = new FederationRouter(registry, normalizer);
      const res = await router.callTool("waqf_quran_get_ayah", { surah: 114, ayah: 1, includeTafsir: true });
      expect((res.result.content[0] as { text: string }).text).toContain(rawCommentary);
    });

    it("preserves embedded hadith attribution inside tafsir text without stripping", async () => {
      const tafsirText = "قال ابن كثير: روى البخاري عن أبي هريرة رضي الله عنه: «كَلِمَتَانِ خَفِيفَتَانِ»";
      const normalized = normalizer.normalizeToolResult(
        { content: [{ type: "text", text: JSON.stringify({ title: "تفسير ابن كثير", text: tafsirText }) }] },
        "Tafsir.net",
        { providerId: "tafsir_net", query: "كلمتان" }
      );
      const sc = normalized.structuredContent as { results: Array<{ content: { verbatim: string } }> };
      expect(sc.results[0].content.verbatim).toBe(tafsirText);
    });

    it("distinguishes empty search (no_results) from upstream failure", async () => {
      const registry = new ProviderRegistry([]);
      const fihris = makeJsonAdapter("fihris", "Fihris", "https://search.waqf.app/api/mcp");
      vi.spyOn(fihris, "callTool").mockResolvedValue({
        content: [{ type: "text", text: "[]" }],
      });
      registry.register(fihris);
      const router = new FederationRouter(registry, normalizer);
      const res = await router.callTool("waqf_search_scholarship", { query: "zzznomatch" });
      expect(res.result.isError).toBeUndefined();
      expect((res.result.structuredContent as { status: string }).status).toBe("no_results");
    });

    it("reports tool error when no Quran provider is registered or both fail", async () => {
      const router = new FederationRouter(new ProviderRegistry([]), normalizer);
      const res = await router.callTool("waqf_quran_get_ayah", { surah: 1, ayah: 1 });
      expect(res.result.isError).toBe(true);
      expect(res.result.error?.code).toBe("SOURCE_UNAVAILABLE");

      const registry = new ProviderRegistry([]);
      const tafsir = makeSseAdapter("tafsir_net", "Tafsir.net", "https://mcp.tafsir.net/mcp");
      const bahouth = makeJsonAdapter("bahouth", "Bahouth", "https://bahouth.tafsir.net/mcp");
      vi.spyOn(tafsir, "callTool").mockRejectedValue(new Error("down"));
      vi.spyOn(bahouth, "callTool").mockRejectedValue(new Error("down"));
      registry.register(tafsir);
      registry.register(bahouth);
      const bothDown = await new FederationRouter(registry, normalizer).callTool("waqf_quran_get_ayah", {
        surah: 1,
        ayah: 1,
      });
      expect(bothDown.result.isError).toBe(true);
      expect(bothDown.result.error?.code).toBe("SOURCE_UNAVAILABLE");
    });
  });

  describe("3. Hadith Variants & Bounded Results", () => {
    it("preserves distinct hadith narrations across providers in waqf_research_search", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = makeJsonAdapter("shamela", "Shamela", "https://mcp.shamela.ws");
      const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
      vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [{ book_id: 1, title: "صحيح البخاري", text: "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى" }],
            }),
          },
        ],
      });
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [{ book_id: 2, title: "صحيح مسلم", text: "إنما الأعمال بالنية وإنما لامرئ ما نوى" }],
            }),
          },
        ],
      });
      registry.register(shamela);
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_research_search", {
        query: "إنما الأعمال",
        domain: "hadith",
      });
      const sc = res.result.structuredContent as { results: Array<{ work: { title: string }; content: { verbatim: string } }> };
      expect(sc.results).toHaveLength(2);
      expect(sc.results.map((r) => r.work.title)).toEqual(expect.arrayContaining(["صحيح البخاري", "صحيح مسلم"]));
    });

    it("bounds waqf_hadith_search to requested limit and keeps retained text verbatim", async () => {
      const registry = new ProviderRegistry([]);
      const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `h_${i + 1}`,
        title: `الحديث ${i + 1}`,
        text: `متن الحديث ${i + 1} [صحيح على شرط الشيخين]`,
      }));
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ count: 10, results: items }) }],
      });
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_hadith_search", { query: "النية", limit: 2 });
      const sc = res.result.structuredContent as {
        results: Array<{ content: { verbatim: string } }>;
        pagination: { has_more: boolean; total: number };
      };
      expect(sc.results).toHaveLength(2);
      expect(sc.results[0].content.verbatim).toBe("متن الحديث 1 [صحيح على شرط الشيخين]");
      expect(sc.pagination.has_more).toBe(true);
      expect(sc.pagination.total).toBe(10);
    });

    it("does not cache empty hadith search results", async () => {
      const registry = new ProviderRegistry([]);
      const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ count: 0, results: [] }) }],
      });
      registry.register(turath);
      const cache = makeNoopCache();
      const router = new FederationRouter(registry, normalizer);

      await router.callTool("waqf_hadith_search", { query: "غيرموجود" }, cache);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("returns SOURCE_UNAVAILABLE tool error when Turath is unconfigured for waqf_hadith_search", async () => {
      const router = new FederationRouter(new ProviderRegistry([]), normalizer);
      const res = await router.callTool("waqf_hadith_search", { query: "الصلاة" });
      expect(res.result.isError).toBe(true);
      expect(res.result.error?.code).toBe("SOURCE_UNAVAILABLE");
    });
  });

  describe("4. Fiqh Comparative Evidence & Federation Routing", () => {
    it("retains conflicting madhhab rulings in comparative fiqh searches", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = makeJsonAdapter("shamela", "Shamela", "https://mcp.shamela.ws");
      const fihris = makeJsonAdapter("fihris", "Fihris", "https://search.waqf.app/api/mcp");
      vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                { book_id: 100, title: "المغني لابن قدامة", text: "لا يجزئ إخراج القيمة في زكاة الفطر" },
                { book_id: 101, title: "بدائع الصنائع", text: "يجوز دفع القيمة نقداً في صدقة الفطر عند الحنفية" },
              ],
            }),
          },
        ],
      });
      vi.spyOn(fihris, "callTool").mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [{ title: "فتوى إخراج زكاة الفطر نقداً", url: "https://islamqa.info/ar/1", snippet: "الخلاف المعتبر بين الفقهاء" }],
            }),
          },
        ],
      });
      registry.register(shamela);
      registry.register(fihris);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_research_search", {
        query: "زكاة الفطر نقداً",
        domain: "fiqh",
      });
      const sc = res.result.structuredContent as { results: Array<{ content: { verbatim: string } }> };
      expect(sc.results).toHaveLength(3);
      expect(sc.results.map((r) => r.content.verbatim)).toEqual(
        expect.arrayContaining([
          "لا يجزئ إخراج القيمة في زكاة الفطر",
          "يجوز دفع القيمة نقداً في صدقة الفطر عند الحنفية",
        ])
      );
    });

    it("honours explicit providers array and warns on unknown provider IDs", async () => {
      const registry = new ProviderRegistry([]);
      const shamela = makeJsonAdapter("shamela", "Shamela", "https://mcp.shamela.ws");
      const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
      const shamelaSpy = vi.spyOn(shamela, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ results: [{ title: "كتاب", text: "نص" }] }) }],
      });
      const turathSpy = vi.spyOn(turath, "callTool");
      registry.register(shamela);
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      const res = await router.callTool("waqf_research_search", {
        query: "نص",
        providers: ["shamela", "nonexistent_provider"],
      });
      const sc = res.result.structuredContent as { warnings: string[]; providers_queried: string[] };
      expect(shamelaSpy).toHaveBeenCalledTimes(1);
      expect(turathSpy).not.toHaveBeenCalled();
      expect(sc.providers_queried).toEqual(["shamela"]);
      expect(sc.warnings.some((w) => w.includes("nonexistent_provider"))).toBe(true);
    });

    it("rejects empty query on waqf_research_search with INVALID_ARGUMENT", async () => {
      const router = new FederationRouter(new ProviderRegistry([]), normalizer);
      const res = await router.callTool("waqf_research_search", { query: "   " });
      expect(res.result.isError).toBe(true);
      expect(res.result.error?.code).toBe("INVALID_ARGUMENT");
    });
  });

  describe("5. Edition-Aware Pagination & Citation Integrity", () => {
    it("keeps printed_page_label distinct from digital_page_number when both are present", () => {
      const normalized = normalizer.normalizeToolResult(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                file_id: 500,
                page_number: 42,
                printed_page: "1/38",
                book_title: "فتح الباري",
                url: "https://aljam3.com/book/500/42",
                text: "باب بدء الوحي",
              }),
            },
          ],
        },
        "Aljam3",
        { providerId: "aljam3" }
      );
      const sc = normalized.structuredContent as {
        results: Array<{
          location: { printed_page_label: string | null; digital_page_number: number | null };
          citation: { citation_markdown: string | null };
        }>;
      };
      expect(sc.results[0].location.printed_page_label).toBe("1/38");
      expect(sc.results[0].location.digital_page_number).toBe(42);
      expect(sc.results[0].citation.citation_markdown).toBe("[فتح الباري (p. 1/38)](https://aljam3.com/book/500/42)");
    });

    it("preserves Shamela upstream citation.markdown verbatim", () => {
      const normalized = normalizer.normalizeToolResult(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                book_id: 1681,
                page_id: 883,
                printed_page: "2/415",
                title: "مجموع الفتاوى",
                citation: {
                  url: "https://shamela.ws/book/1681/883",
                  markdown: "[مجموع الفتاوى (2/415)](https://shamela.ws/book/1681/883)",
                },
                text: "مسألة في أصول الفقه",
              }),
            },
          ],
        },
        "Shamela",
        { providerId: "shamela" }
      );
      const sc = normalized.structuredContent as {
        results: Array<{
          location: { printed_page_label: string | null; page_id: string | null };
          citation: { citation_markdown: string | null; verification_status: string };
        }>;
      };
      expect(sc.results[0].location.printed_page_label).toBe("2/415");
      expect(sc.results[0].location.page_id).toBe("883");
      expect(sc.results[0].citation.citation_markdown).toBe("[مجموع الفتاوى (2/415)](https://shamela.ws/book/1681/883)");
      expect(sc.results[0].citation.verification_status).toBe("resolved");
    });

    it("leaves unknown author, edition, and source_url fields strictly null", () => {
      const normalized = normalizer.normalizeToolResult(
        { content: [{ type: "text", text: "نص بدون بيانات ببليوغرافية" }] },
        "Turath",
        { providerId: "turath" }
      );
      const sc = normalized.structuredContent as {
        results: Array<{
          work: { id: string | null; author: string | null; edition: string | null };
          citation: { source_url: string | null; pdf_url: string | null; verification_status: string };
        }>;
      };
      expect(sc.results[0].work.id).toBeNull();
      expect(sc.results[0].work.author).toBeNull();
      expect(sc.results[0].work.edition).toBeNull();
      expect(sc.results[0].citation.source_url).toBeNull();
      expect(sc.results[0].citation.pdf_url).toBeNull();
      expect(sc.results[0].citation.verification_status).toBe("unverified");
    });
  });

  describe("6. Adversarial & Protocol Edge Cases", () => {
    it("maps malformed upstream JSON into a tool error without crashing", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response("{not-valid-json", { status: 200, headers: { "Content-Type": "application/json" } })
        );
        const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
        const registry = new ProviderRegistry([]);
        registry.register(turath);
        const router = new FederationRouter(registry, normalizer);

        const res = await router.callTool("turath__search_turath", { q: "test" });
        expect(res.result.isError).toBe(true);
        expect(res.result.error?.code).toBe("SOURCE_UNAVAILABLE");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects upstream responses whose Content-Length exceeds 2MB", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response("{}", {
            status: 200,
            headers: { "Content-Length": String(3 * 1024 * 1024) },
          })
        );
        const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
        const registry = new ProviderRegistry([]);
        registry.register(turath);
        const router = new FederationRouter(registry, normalizer);

        const res = await router.callTool("turath__search_turath", { q: "test" });
        expect(res.result.isError).toBe(true);
        expect(res.result.error?.code).toBe("SCHEMA_INVALID");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("preserves Arabic tatweel and mixed RTL/LTR query strings unmodified in query.original", async () => {
      const registry = new ProviderRegistry([]);
      const turath = makeJsonAdapter("turath", "Turath", "https://mcp.turath.io/mcp/");
      vi.spyOn(turath, "callTool").mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ results: [{ title: "البيان", text: "نتيجة" }] }) }],
      });
      registry.register(turath);
      const router = new FederationRouter(registry, normalizer);

      const trickyQuery = "الصـــلاة (al-salah) ﷺ";
      const res = await router.callTool("waqf_hadith_search", { query: trickyQuery });
      const sc = res.result.structuredContent as { query: { original: string } };
      expect(sc.query.original).toBe(trickyQuery);
    });
  });
});
