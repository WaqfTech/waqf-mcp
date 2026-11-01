import { describe, it, expect, vi } from "vitest";
import { PROVIDER_CATALOG, getProviderCatalogEntry } from "@waqf/types";
import { SchemaNormalizer } from "../src/core/normalizer";
import { FederationRouter } from "../src/core/router";
import { ProviderRegistry } from "../src/core/registry";
import { JsonRpcMcpAdapter } from "../src/adapters/jsonrpc";

const shamelaConfig = getProviderCatalogEntry("shamela");

function createAdapter() {
  return new JsonRpcMcpAdapter({
    id: shamelaConfig.id,
    name: shamelaConfig.displayName,
    baseUrl: shamelaConfig.upstreamUrl,
    transport: shamelaConfig.upstreamTransport,
    description: shamelaConfig.summary,
    cacheTtlSeconds: shamelaConfig.cacheTtlSeconds,
  });
}

describe("Shamela provider normalization", () => {
  const normalizer = new SchemaNormalizer();

  it("maps loose argument names onto the upstream schema", () => {
    expect(normalizer.toShamelaArgs("shamela_find", { query: "فضل الصلاة" })).toEqual({
      keywords: ["فضل الصلاة"],
    });
    expect(normalizer.toShamelaArgs("shamela_find", { q: "a", keywords: ["b", "c"] })).toEqual({
      keywords: ["b", "c"],
    });
    expect(
      normalizer.toShamelaArgs("shamela_find_scoped", { query: "الاستصحاب", bookId: 711 })
    ).toEqual({ query: "الاستصحاب", book_ids: [711] });
    expect(
      normalizer.toShamelaArgs("shamela_find_scoped", { keywords: ["a", "b"], authorId: 5 })
    ).toEqual({ queries: ["a", "b"], author_ids: [5] });
    expect(normalizer.toShamelaArgs("shamela_open", { bookId: 1681, pageId: 883 })).toEqual({
      book_id: 1681,
      page_id: 883,
    });
    expect(
      normalizer.toShamelaArgs("shamela_open_many", {
        pages: [{ bookId: 1681, pageId: 883 }, { book_id: 711, page_id: 2580 }],
      })
    ).toEqual({
      pages: [
        { book_id: 1681, page_id: 883 },
        { book_id: 711, page_id: 2580 },
      ],
    });
  });

  it("drops unknown keys, because upstream rejects additional properties", () => {
    const sanitized = normalizer.toShamelaArgs("shamela_find", {
      query: "النية",
      limit: 5,
      expand: ["files"],
      verse_key: "2:255",
    });
    expect(sanitized).toEqual({ keywords: ["النية"] });
  });

  it("enforces upstream bounds and enum values", () => {
    expect(
      normalizer.toShamelaArgs("shamela_open", { bookId: 1, pageId: 2, maxChars: 99999 })
    ).toEqual({ book_id: 1, page_id: 2, max_chars: 16000 });
    expect(
      normalizer.toShamelaArgs("shamela_open", { bookId: 1, pageId: 2, maxChars: 10 })
    ).toEqual({ book_id: 1, page_id: 2, max_chars: 500 });
    expect(
      normalizer.toShamelaArgs("shamela_find_scoped", { query: "q", limit: 99, context: 9 })
    ).toEqual({ query: "q", limit: 20 });
    expect(normalizer.toShamelaArgs("shamela_find", { keywords: ["q"], difficulty: "bogus" })).toEqual(
      { keywords: ["q"] }
    );
    expect(
      normalizer.toShamelaArgs("shamela_find", { keywords: ["q"], difficulty: "hard" })
    ).toEqual({ keywords: ["q"], difficulty: "hard" });
  });

  it("drops empty phrases and invalid page entries", () => {
    expect(normalizer.toShamelaArgs("shamela_find", { query: "   " })).toEqual({});
    expect(
      normalizer.toShamelaArgs("shamela_open_many", {
        pages: [{ bookId: 1, pageId: 2 }, { bookId: "x" }, null],
      })
    ).toEqual({ pages: [{ book_id: 1, page_id: 2 }] });
  });

  it("coerces numeric strings and drops non-numeric ones", () => {
    expect(normalizer.toShamelaArgs("shamela_open", { bookId: "1681", pageId: "883" })).toEqual({
      book_id: 1681,
      page_id: 883,
    });
    expect(normalizer.toShamelaArgs("shamela_open", { bookId: "many", pageId: 2 })).toEqual({
      page_id: 2,
    });
  });

  it("is applied to namespaced calls through sanitizeProviderArgs", () => {
    expect(
      normalizer.sanitizeProviderArgs("shamela", "shamela_find", { query: "فقه", limit: 40 })
    ).toEqual({ keywords: ["فقه"] });
    expect(
      normalizer.sanitizeProviderArgs("shamela", "shamela_open", {
        bookId: 1681,
        pageNumber: 883,
      })
    ).toEqual({ book_id: 1681, page_id: 883 });
  });
});

describe("Shamela suite routing", () => {
  const normalizer = new SchemaNormalizer();

  it("lists Shamela tools in the heritage suite only", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    vi.spyOn(adapter, "listTools").mockResolvedValue(
      shamelaConfig.tools.map((name) => ({ name, inputSchema: { type: "object" } }))
    );
    registry.register(adapter);

    const router = new FederationRouter(registry, normalizer);
    const names = (await router.listAllTools("turath")).map((tool) => tool.name);

    expect(names).toContain("shamela__shamela_find");
    expect(names).toContain("shamela__shamela_open");
    // Shamela is not part of the Quran or search suites
    for (const suite of ["quran", "search"] as const) {
      const suiteNames = (await router.listAllTools(suite)).map((tool) => tool.name);
      expect(suiteNames.some((name) => name.startsWith("shamela__"))).toBe(false);
    }
  });

  it("dispatches namespaced calls with sanitized arguments", async () => {
    const registry = new ProviderRegistry([]);
    const adapter = createAdapter();
    const callTool = vi.spyOn(adapter, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "نتائج البحث" }],
    });
    registry.register(adapter);

    const router = new FederationRouter(registry, normalizer);
    const res = await router.callTool("shamela__shamela_find", { query: "النية" });

    expect(callTool).toHaveBeenCalledWith("shamela_find", { keywords: ["النية"] });
    expect(res.providerId).toBe("shamela");
    expect(res.isCacheHit).toBe(false);
  });

  it("keeps the catalog entry in sync with the registered provider", () => {
    expect(PROVIDER_CATALOG.map((entry) => entry.id)).toContain("shamela");
    expect(shamelaConfig.upstreamUrl).toBe("https://mcp.shamela.ws");
    expect(shamelaConfig.upstreamTransport).toBe("json-rpc");
    expect(shamelaConfig.cacheTtlSeconds).toBe(604800);
    expect(shamelaConfig.tools).toHaveLength(4);
  });
});
