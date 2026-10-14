/**
 * Federated provider catalog: the single source of truth for which upstream MCP
 * servers the gateway federates and which tools each one exposes.
 *
 * Data conventions:
 * - Machine identifiers live here: IDs, URLs, tool names, transport protocols,
 *   counts and language codes. Every natural-language word belongs in
 *   apps/web/src/lang/*.json instead.
 * - Tool lists are verified against each upstream's live tools/list response.
 *   When an upstream changes its surface, update this file: the landing page,
 *   the llms artifacts and the API provider config all read from it, and
 *   apps/api/test/catalog-drift.test.ts fails when they disagree.
 */

export type ProviderId =
  | "tafsir_net"
  | "bahouth"
  | "turath"
  | "maheralfahel"
  | "fihris"
  | "aljam3";

export type ProviderToolCategory = "quran" | "turath" | "tools";

export type ProviderUpstreamTransport = "json-rpc" | "sse";

export type GatewaySuiteId = "core" | "quran" | "turath" | "search" | "all";

export interface ProviderCatalogEntry {
  id: ProviderId;
  /** Machine-facing English name, mirroring the upstream provider config. */
  displayName: string;
  /** Machine-facing English summary used in tool description prefixes. */
  summary: string;
  /** Upstream MCP endpoint the gateway calls. */
  upstreamUrl: string;
  upstreamTransport: ProviderUpstreamTransport;
  upstreamAuth: "none" | "oauth";
  /** Public site a reader can open for the source material. */
  siteUrl: string;
  category: ProviderToolCategory;
  /** Renders the card with the full capabilities grid. */
  featured: boolean;
  suites: readonly GatewaySuiteId[];
  timeoutMs: number;
  enabled: boolean;
  cacheTtlSeconds?: number;
  tools: readonly string[];
  resources?: readonly string[];
  prompts?: readonly string[];
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "tafsir_net",
    displayName: "Tafsir.net Specialized Suite",
    summary: "Authentic Quran Tafsir sources, Qira'at variants, and Nuzool context.",
    upstreamUrl: "https://mcp.tafsir.net/mcp",
    upstreamTransport: "sse",
    upstreamAuth: "none",
    siteUrl: "https://mcp.tafsir.net/mcp",
    category: "quran",
    featured: true,
    suites: ["quran", "all"],
    timeoutMs: 8000,
    enabled: true,
    tools: [
      "fetch_ayah",
      "fetch_tafsir",
      "list_tafsir_sources",
      "list_science_sources",
      "list_all_sources",
      "list_sources_for_ayah",
      "fetch_nuzool_reason",
      "fetch_surah_info",
      "analyze_word",
      "find_root_occurrences",
      "get_root_stats",
      "get_qeraat_variants",
      "search_quran_text",
      "search_in_tafsir",
      "get_quran_overview",
      "get_page_fawaed",
      "get_surah_statistics",
    ],
    resources: ["quran://surahs", "quran://tafsirs", "quran://sciences", "quran://schema"],
    prompts: ["study_ayah", "compare_tafsirs", "root_study", "surah_overview", "tajweed_lesson"],
  },
  {
    id: "bahouth",
    displayName: "Bahouth Quran & Tafsir",
    summary: "Quranic text analysis, roots, morphology, and verse topics.",
    upstreamUrl: "https://bahouth.tafsir.net/mcp",
    upstreamTransport: "json-rpc",
    upstreamAuth: "none",
    siteUrl: "https://bahouth.tafsir.net/mcp",
    category: "quran",
    featured: false,
    suites: ["quran", "all"],
    timeoutMs: 8000,
    enabled: true,
    tools: [
      "get_verse",
      "list_surah_verses",
      "list_verse_words",
      "find_root",
      "list_root_verses",
      "list_verse_properties",
      "list_verse_qiraat",
      "list_verse_topics",
      "list_topic_verses",
    ],
  },
  {
    id: "turath",
    displayName: "Turath Islamic Heritage Library",
    summary: "Full-text search and pages across thousands of classical Islamic books.",
    upstreamUrl: "https://mcp.turath.io/mcp/",
    upstreamTransport: "json-rpc",
    upstreamAuth: "none",
    siteUrl: "https://mcp.turath.io/mcp/",
    category: "turath",
    featured: false,
    suites: ["turath", "all"],
    timeoutMs: 8000,
    enabled: true,
    tools: ["discover_turath", "search_turath", "get_book", "get_page", "get_author"],
  },
  {
    id: "maheralfahel",
    displayName: "Sheikh Maher Al-Fahel Scholarly Library",
    summary: "Specialized Hadith critique, books, media, and scholarly publications.",
    upstreamUrl: "https://maheralfahel.net/mcp/",
    upstreamTransport: "sse",
    upstreamAuth: "none",
    siteUrl: "https://maheralfahel.net/mcp/",
    category: "turath",
    featured: false,
    suites: ["turath", "all"],
    timeoutMs: 8000,
    enabled: true,
    tools: ["list-books", "get-book", "list-media", "search-content", "get-site-info"],
  },
  {
    id: "fihris",
    displayName: "Fihris Islamic Web Search",
    summary: "Curated Google Custom Search across 38+ authentic Islamic scholarship portals.",
    upstreamUrl: "https://search.waqf.app/api/mcp",
    upstreamTransport: "json-rpc",
    upstreamAuth: "none",
    siteUrl: "https://search.waqf.app/",
    category: "tools",
    featured: false,
    suites: ["search", "all"],
    timeoutMs: 10000,
    enabled: true,
    tools: ["search_islamic_sources", "list_indexed_sources"],
  },
  {
    id: "aljam3",
    displayName: "Aljam3 Islamic Books Library",
    summary:
      "Read-only classical Islamic books library: search the corpus and read a page in context with book, author, file and page citations.",
    upstreamUrl: "https://aljam3.com/mcp",
    upstreamTransport: "json-rpc",
    upstreamAuth: "none",
    siteUrl: "https://aljam3.com",
    category: "turath",
    featured: false,
    suites: ["turath", "all"],
    timeoutMs: 10000,
    enabled: true,
    cacheTtlSeconds: 604800,
    tools: [
      "search",
      "list_books",
      "get_book",
      "get_page",
      "list_authors",
      "list_categories",
      "list_libraries",
    ],
  },
];

export const PROVIDER_COUNT: number = PROVIDER_CATALOG.length;

export const TOTAL_PROVIDER_TOOL_COUNT: number = PROVIDER_CATALOG.reduce(
  (total, entry) => total + entry.tools.length,
  0
);

/** Canonical waqf_* tools exposed on top of the federated surface. */
export const CANONICAL_TOOL_NAMES: readonly string[] = [
  "waqf_quran_get_ayah",
  "waqf_hadith_search",
  "waqf_turath_search_books",
  "waqf_search_scholarship",
  "waqf_books_search",
  "waqf_books_read_page",
];

export const TOTAL_GATEWAY_TOOL_COUNT: number =
  TOTAL_PROVIDER_TOOL_COUNT + CANONICAL_TOOL_NAMES.length;

export const CATALOG_RESOURCE_COUNT: number = PROVIDER_CATALOG.reduce(
  (total, entry) => total + (entry.resources?.length ?? 0),
  0
);

export const CATALOG_PROMPT_COUNT: number = PROVIDER_CATALOG.reduce(
  (total, entry) => total + (entry.prompts?.length ?? 0),
  0
);

export function providerToolsCount(entry: ProviderCatalogEntry): number {
  return entry.tools.length;
}

export function getProviderCatalogEntry(id: ProviderId): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Unknown federated provider: '${id}'`);
  }
  return entry;
}

export function providersForSuite(suite: GatewaySuiteId): readonly ProviderCatalogEntry[] {
  if (suite === "all") {
    return PROVIDER_CATALOG;
  }
  return PROVIDER_CATALOG.filter((entry) => entry.suites.includes(suite));
}
