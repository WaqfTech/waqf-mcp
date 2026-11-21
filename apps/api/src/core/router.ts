import { CANONICAL_TOOL_NAMES, PROVIDER_CATALOG } from "@waqf/types";
import type {
  CanonicalEvidenceItem,
  CanonicalResultEnvelope,
  GatewayErrorCode,
  GetPromptResult,
  PromptDefinition,
  ReadResourceResult,
  ResourceDefinition,
  ToolDefinition,
  ToolResult,
} from "@waqf/types";
import { classifyThrownError } from "../adapters/base";
import { ProviderRegistry } from "./registry";
import { SchemaNormalizer } from "./normalizer";
import { DEFAULT_CACHE_TTL_SECONDS, type D1CacheService } from "../services/cache";

export interface CallToolResponse {
  providerId: string;
  originalToolName: string;
  result: ToolResult;
  isCacheHit: boolean;
}

export interface ReadResourceResponse {
  providerId: string;
  result: ReadResourceResult;
  isCacheHit: boolean;
}

const CANONICAL_TOOL_HINT = `Available canonical tools: ${CANONICAL_TOOL_NAMES.join(", ")}.`;

const PROVIDERS_WITH_RESOURCES = new Set<string>(
  PROVIDER_CATALOG.filter((entry) => (entry.resources?.length ?? 0) > 0).map(
    (entry) => entry.id
  )
);

const PROVIDERS_WITH_PROMPTS = new Set<string>(
  PROVIDER_CATALOG.filter((entry) => (entry.prompts?.length ?? 0) > 0).map(
    (entry) => entry.id
  )
);

const CANONICAL_PRIMARY_PROVIDER: Record<string, string> = {
  waqf_quran_get_ayah: "tafsir_net",
  waqf_turath_search_books: "turath",
  waqf_hadith_search: "turath",
  waqf_search_scholarship: "fihris",
  waqf_books_search: "aljam3",
  waqf_books_read_page: "aljam3",
  waqf_research_search: "shamela",
};

const RESEARCH_DOMAIN_PROVIDERS: Record<string, readonly string[]> = {
  quran: ["tafsir_net", "bahouth"],
  tafsir: ["tafsir_net", "shamela", "turath"],
  hadith: ["shamela", "turath", "maheralfahel"],
  fiqh: ["shamela", "aljam3", "turath", "fihris"],
  aqidah: ["shamela", "turath", "fihris"],
  linguistics: ["bahouth", "tafsir_net", "shamela"],
  history: ["shamela", "aljam3", "turath"],
  biography: ["shamela", "aljam3", "turath"],
  general: ["shamela", "aljam3", "turath", "fihris"],
};

/**
 * Invalid or unknown tool names are caller errors, not gateway failures. The
 * MCP contract asks for a tool result with isError so the model can correct
 * itself; throwing here produced an internal-error response and a 500 log for
 * every stale or typo'd tool name.
 */
function toolError(
  providerId: string,
  toolName: string,
  message: string,
  code: GatewayErrorCode = "INVALID_ARGUMENT",
  retryable = false
): CallToolResponse {
  return {
    providerId,
    originalToolName: toolName,
    isCacheHit: false,
    result: {
      isError: true,
      error: { code, message, source: providerId, retryable },
      content: [{ type: "text", text: message }],
    },
  };
}

export interface GetPromptResponse {
  providerId: string;
  result: GetPromptResult;
}

/**
 * A provider that fails while listing silently shrinks the advertised tool set —
 * Fihris did exactly that in production, and nothing recorded it. Warn once per
 * isolate per provider so a dropped upstream is visible in `aube run tail`
 * instead of only in a smaller list.
 */
const warnedProviders = new Set<string>();

export function resetProviderWarnings(): void {
  warnedProviders.clear();
}

function warnProviderUnavailable(scope: string, providerId: string, error: unknown): void {
  const key = `${scope}:${providerId}`;
  if (warnedProviders.has(key)) {
    return;
  }
  warnedProviders.add(key);
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(
    `[router] provider '${providerId}' failed during ${scope}; its entries are omitted from this response. (${detail})`
  );
}

export class FederationRouter {
  public readonly normalizer: SchemaNormalizer;

  constructor(
    private registry: ProviderRegistry,
    normalizer?: SchemaNormalizer
  ) {
    this.normalizer = normalizer ?? new SchemaNormalizer();
  }

  public async listAllTools(suite = "all"): Promise<ToolDefinition[]> {
    const canonicalTools = this.normalizer.getCanonicalToolDefinitions();

    // Core suite: Only high-level curated Waqf tools to keep LLM context compact
    if (suite === "core") {
      return canonicalTools;
    }

    const providers = this.registry.getAll();
    const settled = await Promise.allSettled(
      providers.map(async (provider) => {
        const tools = await this.registry.getProviderTools(provider);
        return tools.map((tool) => ({
          ...tool,
          name: `${provider.id}__${tool.name}`,
          description: `[${provider.name}] ${tool.description ?? ""}`.trim(),
          annotations: tool.annotations ?? {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: provider.id === "fihris",
          },
        }));
      })
    );

    const namespaced: ToolDefinition[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        namespaced.push(...result.value);
        return;
      }
      warnProviderUnavailable("tools/list", providers[index].id, result.reason);
    });

    if (suite === "raw") {
      return namespaced;
    }

    if (suite === "quran") {
      return [
        ...canonicalTools.filter((t) => t.name.startsWith("waqf_quran")),
        ...namespaced.filter(
          (t) => t.name.startsWith("bahouth__") || t.name.startsWith("tafsir_net__")
        ),
      ];
    }

    if (suite === "turath") {
      return [
        ...canonicalTools.filter(
          (t) =>
            t.name.startsWith("waqf_turath") ||
            t.name.startsWith("waqf_hadith") ||
            t.name.startsWith("waqf_books")
        ),
        ...namespaced.filter(
          (t) =>
            t.name.startsWith("turath__") ||
            t.name.startsWith("maheralfahel__") ||
            t.name.startsWith("aljam3__") ||
            t.name.startsWith("shamela__")
        ),
      ];
    }

    if (suite === "search") {
      return [
        ...canonicalTools.filter((t) => t.name.startsWith("waqf_search")),
        ...namespaced.filter((t) => t.name.startsWith("fihris__")),
      ];
    }

    // Default 'all': Canonical tools on top, followed by namespaced tools
    return [...canonicalTools, ...namespaced];
  }

  public async callTool(
    fullName: string,
    args: Record<string, unknown>,
    cacheService?: D1CacheService,
    ctx?: ExecutionContext
  ): Promise<CallToolResponse> {
    // 1. Check Canonical Tool Dispatch
    if (fullName.startsWith("waqf_")) {
      if (!CANONICAL_TOOL_NAMES.includes(fullName)) {
        return toolError(
          "canonical",
          fullName,
          `Unknown canonical tool '${fullName}'. ${CANONICAL_TOOL_HINT}`
        );
      }
      return this.handleCanonicalCall(fullName, args, cacheService, ctx);
    }

    // 2. Namespaced Tool Dispatch
    const separatorIndex = fullName.indexOf("__");
    if (separatorIndex === -1) {
      return toolError(
        "gateway",
        fullName,
        `Invalid tool name '${fullName}'. Use 'waqf_<tool>' or '<provider>__<tool>'. ${CANONICAL_TOOL_HINT}`
      );
    }

    const providerId = fullName.slice(0, separatorIndex);
    const originalToolName = fullName.slice(separatorIndex + 2);

    if (!providerId || !originalToolName) {
      return toolError(
        providerId || "gateway",
        fullName,
        `Invalid tool name '${fullName}'. Provider and tool segments cannot be empty.`
      );
    }

    const provider = this.registry.get(providerId);
    if (!provider) {
      const providerIds = this.registry
        .getAll()
        .map((entry) => entry.id)
        .join(", ");
      return toolError(
        providerId,
        fullName,
        `Unknown upstream provider '${providerId}' in tool '${fullName}'. Available providers: ${providerIds}.`
      );
    }

    const sanitizedArgs = this.normalizer.sanitizeProviderArgs(providerId, originalToolName, args);

    // Cache lookup
    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey(providerId, originalToolName, sanitizedArgs);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        const hitTtl = provider.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
        if (ctx) {
          ctx.waitUntil(cacheService.recordHit(cacheKey, hitTtl));
        } else {
          cacheService.recordHit(cacheKey, hitTtl).catch(() => {});
        }
        return {
          providerId,
          originalToolName,
          result: cached,
          isCacheHit: true,
        };
      }
    }

    let result: ToolResult;
    try {
      result = await provider.callTool(originalToolName, sanitizedArgs);
    } catch (err: unknown) {
      const classified = classifyThrownError(providerId, err);
      return toolError(
        providerId,
        fullName,
        `Upstream '${providerId}' failed while calling '${originalToolName}': ${classified.message}`,
        classified.code,
        classified.retryable
      );
    }

    // Save to cache asynchronously if valid and non-empty
    if (cacheService && cacheKey && !result.isError && !this.isEmptyResult(result)) {
      if (ctx) {
        ctx.waitUntil(cacheService.set(cacheKey, providerId, originalToolName, result, provider.cacheTtlSeconds));
      } else {
        cacheService.set(cacheKey, providerId, originalToolName, result, provider.cacheTtlSeconds).catch(() => {});
      }
    }

    return {
      providerId,
      originalToolName,
      result,
      isCacheHit: false,
    };
  }

  private canonicalCacheTtl(toolName: string): number {
    const providerId = CANONICAL_PRIMARY_PROVIDER[toolName];
    return (
      (providerId ? this.registry.get(providerId)?.cacheTtlSeconds : undefined) ??
      DEFAULT_CACHE_TTL_SECONDS
    );
  }

  private async handleCanonicalCall(
    toolName: string,
    args: Record<string, unknown>,
    cacheService?: D1CacheService,
    ctx?: ExecutionContext
  ): Promise<CallToolResponse> {
    // Books calls are keyed on their sanitized upstream arguments so that
    // equivalent spellings ({query, limit} vs {query, per_page}) share one cache
    // entry instead of calling upstream twice. The same sanitized object is sent
    // upstream, so the cache key and the upstream call cannot drift apart.
    const bookArgs =
      toolName === "waqf_books_search"
        ? this.normalizer.toAljam3Args("search", args)
        : toolName === "waqf_books_read_page"
          ? this.normalizer.toAljam3Args("get_page", args)
          : null;

    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey("canonical", toolName, bookArgs ?? args);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        const hitTtl = this.canonicalCacheTtl(toolName);
        if (ctx) {
          ctx.waitUntil(cacheService.recordHit(cacheKey, hitTtl));
        } else {
          cacheService.recordHit(cacheKey, hitTtl).catch(() => {});
        }
        return {
          providerId: "canonical",
          originalToolName: toolName,
          result: cached,
          isCacheHit: true,
        };
      }
    }

    let result: ToolResult = { content: [] };
    let targetProvider = "canonical";
    let servedByFallback = false;

    switch (toolName) {
      case "waqf_quran_get_ayah": {
        const surah = Number(args.surah);
        const ayah = Number(args.ayah);
        const tafsirProvider = this.registry.get("tafsir_net");
        const bahouthProvider = this.registry.get("bahouth");

        let fetched = false;

        // Primary: Tafsir.net
        if (tafsirProvider) {
          try {
            targetProvider = "tafsir_net";
            const upstreamArgs = this.normalizer.toTafsirNetAyahArgs({
              surah,
              ayah,
              includeTafsir: Boolean(args.includeTafsir),
              includeTajweed: Boolean(args.includeTajweed),
              tafsirSource: args.tafsirSource ? String(args.tafsirSource) : undefined,
              includeSciences: Array.isArray(args.includeSciences)
                ? (args.includeSciences as string[])
                : undefined,
            });
            const raw = await tafsirProvider.callTool("fetch_ayah", upstreamArgs);
            if (!raw.isError) {
              result = this.normalizer.normalizeToolResult(raw, "Tafsir.net", {
                providerId: "tafsir_net",
                query: `${surah}:${ayah}`,
                mode: "quran_ayah",
              });
              fetched = true;
            }
          } catch {
            // Fall through to Bahouth fallback
          }
        }

        // Fallback: Bahouth
        if (!fetched && bahouthProvider) {
          targetProvider = "bahouth";
          const raw = await bahouthProvider.callTool("get_verse", {
            verse_key: this.normalizer.toBahouthVerseKey({ surah, ayah }),
          });
          result = this.normalizer.normalizeToolResult(raw, "Bahouth", {
            providerId: "bahouth",
            query: `${surah}:${ayah}`,
            mode: "quran_ayah",
            warnings: ["Primary Quran provider (tafsir_net) unavailable; served via Bahouth fallback."],
          });
          fetched = true;
        }

        if (!fetched) {
          return toolError(
            "canonical",
            toolName,
            "No Quran provider is available right now; retry in a moment.",
            "SOURCE_UNAVAILABLE",
            true
          );
        }
        break;
      }

      case "waqf_turath_search_books": {
        const turathProvider = this.registry.get("turath");
        if (!turathProvider) {
          return toolError(
            "turath",
            toolName,
            "Turath provider not configured",
            "SOURCE_UNAVAILABLE",
            false
          );
        }
        targetProvider = "turath";
        const query = String(args.query ?? "");
        try {
          const raw = await turathProvider.callTool("discover_turath", {
            q: query,
            kind: args.kind ?? "books",
          });
          result = this.normalizer.normalizeToolResult(raw, "Turath Library", {
            providerId: "turath",
            query,
            mode: String(args.kind ?? "books"),
          });
        } catch (err: unknown) {
          const classified = classifyThrownError("turath", err);
          return toolError("turath", toolName, classified.message, classified.code, classified.retryable);
        }
        break;
      }

      case "waqf_hadith_search": {
        const turathProvider = this.registry.get("turath");
        if (!turathProvider) {
          return toolError(
            "turath",
            toolName,
            "Hadith/Turath provider not configured",
            "SOURCE_UNAVAILABLE",
            false
          );
        }
        targetProvider = "turath";
        const query = String(args.query ?? "");
        const parsedLimit = Number(args.limit ?? 5);
        const limit = Number.isFinite(parsedLimit)
          ? Math.min(20, Math.max(1, Math.trunc(parsedLimit)))
          : 5;
        try {
          const raw = await turathProvider.callTool("search_turath", {
            q: query,
          });
          const bounded = this.normalizer.boundResultList(raw, limit);
          result = this.normalizer.normalizeToolResult(bounded.result, "Hadith Sources (Turath)", {
            providerId: "turath",
            query,
            mode: "hadith_search",
            limit,
            hasMore: bounded.hasMore,
          });
        } catch (err: unknown) {
          const classified = classifyThrownError("turath", err);
          return toolError("turath", toolName, classified.message, classified.code, classified.retryable);
        }
        break;
      }

      case "waqf_search_scholarship": {
        const fihrisProvider = this.registry.get("fihris");
        const turathProvider = this.registry.get("turath");
        const query = String(args.query || args.q || "");
        const page = typeof args.page === "number" ? args.page : 1;
        let fetched = false;

        // Primary: Fihris web search across Islamic directories
        if (fihrisProvider) {
          try {
            targetProvider = "fihris";
            const raw = await fihrisProvider.callTool("search_islamic_sources", args);
            if (!raw.isError) {
              result = this.normalizer.normalizeToolResult(raw, "Fihris Islamic Search", {
                providerId: "fihris",
                query,
                mode: "scholarship_search",
                page,
              });
              fetched = true;
            }
          } catch {
            // Fall through to Turath fallback
          }
        }

        // Resilient Fallback: Turath heritage library search if Fihris failed or had isError.
        // Turath accepts only a free-text query, so a request carrying filters
        // (fileType, dateRestrict, page) cannot be answered faithfully: fail
        // explicitly instead of returning a wider result set as the answer.
        if (!fetched && turathProvider) {
          const unsupported = Object.keys(args).filter((key) => key !== "query" && key !== "q");
          if (unsupported.length > 0) {
            // Tool-level failure, not a protocol error: the caller receives the
            // reason as result content it can act on (retry without the filters)
            // instead of a generic internal error, and nothing is cached.
            return {
              providerId: targetProvider,
              originalToolName: toolName,
              isCacheHit: false,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Fihris web search is unavailable and the Turath fallback cannot honour ${unsupported.join(
                      ", "
                    )}; retry without those filters or after Fihris recovers.`,
                  },
                ],
              },
            };
          }
          try {
            targetProvider = "turath";
            const raw = await turathProvider.callTool("search_turath", { q: query });
            const bounded = this.normalizer.boundResultList(raw, 10);
            result = this.normalizer.normalizeToolResult(
              bounded.result,
              "Turath Islamic Heritage (Scholarship Fallback)",
              {
                providerId: "turath",
                query,
                mode: "scholarship_search",
                limit: 10,
                hasMore: bounded.hasMore,
                warnings: ["Primary search provider (fihris) unavailable; served via Turath fallback."],
              }
            );
            fetched = true;
            servedByFallback = true;
          } catch {
            // Fall through
          }
        }

        if (!fetched) {
          return toolError(
            "canonical",
            toolName,
            "No scholarship search provider is available right now; retry in a moment.",
            "SOURCE_UNAVAILABLE",
            true
          );
        }
        break;
      }

      case "waqf_books_search": {
        const aljam3Provider = this.registry.get("aljam3");
        const turathProvider = this.registry.get("turath");
        const query = String((bookArgs ?? {}).q ?? "");
        const limit = typeof bookArgs?.per_page === "number" ? bookArgs.per_page : 10;
        const page = typeof bookArgs?.page === "number" ? bookArgs.page : 1;
        let fetched = false;

        // Primary: Aljam3 books corpus (passages with citations and source links)
        if (aljam3Provider) {
          try {
            targetProvider = "aljam3";
            const raw = await aljam3Provider.callTool("search", bookArgs ?? {});
            if (!raw.isError) {
              result = this.normalizer.normalizeToolResult(raw, "Aljam3 Library", {
                providerId: "aljam3",
                query,
                mode: "books_search",
                limit,
                page,
              });
              fetched = true;
            }
          } catch {
            // Fall through to Turath fallback
          }
        }

        // Resilient fallback: Turath heritage library full-text search. Turath
        // accepts only a free-text query, so book/author/category/library filters
        // and pagination cannot be preserved: a constrained call fails explicitly
        // rather than silently answering from a broader corpus.
        if (!fetched && turathProvider) {
          const unsupported = Object.keys(bookArgs ?? {}).filter((key) => key !== "q" && key !== "locale");
          if (unsupported.length > 0) {
            // Same contract as the scholarship refusal: a tool error carrying the
            // reason, so the caller can retry unfiltered, and no cache write.
            return {
              providerId: targetProvider,
              originalToolName: toolName,
              isCacheHit: false,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Aljam3 books search is unavailable and the Turath fallback cannot honour ${unsupported.join(
                      ", "
                    )}; retry without those filters or after Aljam3 recovers.`,
                  },
                ],
              },
            };
          }
          try {
            targetProvider = "turath";
            const raw = await turathProvider.callTool("search_turath", { q: query });
            const bounded = this.normalizer.boundResultList(raw, limit);
            result = this.normalizer.normalizeToolResult(
              bounded.result,
              "Turath Islamic Heritage (Books Fallback)",
              {
                providerId: "turath",
                query,
                mode: "books_search",
                limit,
                hasMore: bounded.hasMore,
                warnings: ["Primary books provider (aljam3) unavailable; served via Turath fallback."],
              }
            );
            fetched = true;
            servedByFallback = true;
          } catch {
            // Fall through
          }
        }

        if (!fetched) {
          return toolError(
            "canonical",
            toolName,
            "No books search provider is available right now; retry in a moment.",
            "SOURCE_UNAVAILABLE",
            true
          );
        }
        break;
      }

      case "waqf_books_read_page": {
        const aljam3Provider = this.registry.get("aljam3");
        if (!aljam3Provider) {
          return toolError(
            "aljam3",
            toolName,
            "Aljam3 books provider not configured",
            "SOURCE_UNAVAILABLE",
            false
          );
        }
        targetProvider = "aljam3";
        try {
          const raw = await aljam3Provider.callTool("get_page", bookArgs ?? {});
          result = this.normalizer.normalizeToolResult(raw, "Aljam3 Library", {
            providerId: "aljam3",
            query: `${bookArgs?.file_id ?? ""}:${bookArgs?.page_number ?? ""}`,
            mode: "books_read_page",
          });
        } catch (err: unknown) {
          const classified = classifyThrownError("aljam3", err);
          return toolError("aljam3", toolName, classified.message, classified.code, classified.retryable);
        }
        break;
      }

      case "waqf_research_search": {
        const federated = await this.handleFederatedResearchSearch(args);
        if (federated.result.isError) {
          return federated;
        }
        result = federated.result;
        targetProvider = federated.providerId;
        servedByFallback = federated.isPartial;
        break;
      }

      default:
        throw new Error(`Unhandled canonical tool: '${toolName}'`);
    }

    // A fallback answer comes from a different corpus, so it is never cached
    // under the primary tool's key: the cache must not keep serving it after the
    // primary provider recovers.
    if (cacheService && cacheKey && !result.isError && !this.isEmptyResult(result) && !servedByFallback) {
      const ttl = this.registry.get(targetProvider)?.cacheTtlSeconds;
      if (ctx) {
        ctx.waitUntil(cacheService.set(cacheKey, "canonical", toolName, result, ttl));
      } else {
        cacheService.set(cacheKey, "canonical", toolName, result, ttl).catch(() => {});
      }
    }

    return {
      providerId: targetProvider,
      originalToolName: toolName,
      result,
      isCacheHit: false,
    };
  }

  private async handleFederatedResearchSearch(
    args: Record<string, unknown>
  ): Promise<CallToolResponse & { isPartial: boolean }> {
    const query = String(args.query ?? "").trim();
    if (!query) {
      return {
        ...toolError(
          "canonical",
          "waqf_research_search",
          "Missing required 'query' parameter for waqf_research_search.",
          "INVALID_ARGUMENT",
          false
        ),
        isPartial: false,
      };
    }

    const domain = String(args.domain ?? "general");
    const parsedMax = Number(args.max_results ?? 10);
    const maxResults = Number.isFinite(parsedMax)
      ? Math.min(20, Math.max(1, Math.trunc(parsedMax)))
      : 10;
    const perProviderLimit = Math.min(5, maxResults);

    const warnings: string[] = [];
    let requestedIds: string[];
    if (Array.isArray(args.providers)) {
      requestedIds = [];
      for (const rawId of args.providers) {
        const pid = String(rawId).trim();
        if (!pid) continue;
        if (this.registry.get(pid)) {
          if (!requestedIds.includes(pid)) requestedIds.push(pid);
        } else {
          warnings.push(`Skipped unknown or disabled provider '${pid}'.`);
        }
      }
    } else {
      const candidates = RESEARCH_DOMAIN_PROVIDERS[domain] ?? RESEARCH_DOMAIN_PROVIDERS.general;
      requestedIds = candidates.filter((pid) => Boolean(this.registry.get(pid)));
    }

    if (requestedIds.length === 0) {
      return {
        ...toolError(
          "canonical",
          "waqf_research_search",
          "No requested providers are available for federated research search.",
          "SOURCE_UNAVAILABLE",
          true
        ),
        isPartial: false,
      };
    }

    const buildProviderCall = (
      pid: string
    ): { toolName: string; toolArgs: Record<string, unknown> } => {
      switch (pid) {
        case "tafsir_net":
          return { toolName: "search_quran_text", toolArgs: { query, limit: perProviderLimit } };
        case "bahouth":
          return { toolName: "find_root", toolArgs: { root_text: query } };
        case "turath":
          return { toolName: "search_turath", toolArgs: { q: query } };
        case "maheralfahel":
          return { toolName: "search-content", toolArgs: { query } };
        case "fihris":
          return { toolName: "search_islamic_sources", toolArgs: { query } };
        case "aljam3":
          return { toolName: "search", toolArgs: { q: query, per_page: perProviderLimit } };
        case "shamela":
          return { toolName: "shamela_find", toolArgs: { keywords: [query] } };
        default:
          return { toolName: "search", toolArgs: { query } };
      }
    };

    const settled = await Promise.allSettled(
      requestedIds.map(async (pid) => {
        const provider = this.registry.get(pid)!;
        const spec = buildProviderCall(pid);
        const raw = await provider.callTool(spec.toolName, spec.toolArgs);
        if (raw.isError) {
          const msg = raw.error?.message ?? `Provider '${pid}' returned a tool error.`;
          throw new Error(msg);
        }
        const bounded = this.normalizer.boundResultList(raw, perProviderLimit);
        const normalized = this.normalizer.normalizeToolResult(bounded.result, provider.name, {
          providerId: pid,
          query,
          mode: `federated:${domain}`,
          limit: perProviderLimit,
        });
        const sc = normalized.structuredContent as CanonicalResultEnvelope | undefined;
        return { pid, items: sc?.results ?? [] };
      })
    );

    const collected: CanonicalEvidenceItem[] = [];
    const succeededProviders: string[] = [];
    const failedProviders: string[] = [];
    const seenExact = new Set<string>();

    settled.forEach((outcome, index) => {
      const pid = requestedIds[index];
      if (outcome.status === "fulfilled") {
        succeededProviders.push(pid);
        for (const item of outcome.value.items) {
          const dedupKey = `${item.provider}:${item.work.id ?? ""}:${item.location.page_id ?? ""}:${item.content.verbatim}`;
          if (seenExact.has(dedupKey)) continue;
          seenExact.add(dedupKey);
          collected.push(item);
        }
      } else {
        failedProviders.push(pid);
        const reason =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        warnings.push(`Provider '${pid}' failed: ${reason}`);
      }
    });

    if (succeededProviders.length === 0) {
      return {
        ...toolError(
          "canonical",
          "waqf_research_search",
          `All queried providers failed (${failedProviders.join(", ")}): ${warnings.join(" | ")}`,
          "SOURCE_UNAVAILABLE",
          true
        ),
        isPartial: false,
      };
    }

    const lowerQuery = query.toLowerCase();
    const scoreItem = (item: CanonicalEvidenceItem): number => {
      let score = 0;
      if (item.content.verbatim.toLowerCase().includes(lowerQuery)) score += 4;
      if ((item.work.title ?? "").toLowerCase().includes(lowerQuery)) score += 2;
      if (item.citation.source_url || item.citation.pdf_url) score += 2;
      if (item.location.printed_page_label || item.location.digital_page_number !== null) score += 1;
      return score;
    };

    const ranked = [...collected].sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, maxResults);
    const isPartial = failedProviders.length > 0;
    const status: CanonicalResultEnvelope["status"] =
      ranked.length === 0 ? "no_results" : isPartial ? "partial_results" : "ok";

    const envelope: CanonicalResultEnvelope & {
      trust_boundary: "external_untrusted_source";
      providers_queried: string[];
      providers_succeeded: string[];
      providers_failed: string[];
    } = {
      schema_version: "1.0.0",
      trust_boundary: "external_untrusted_source",
      status,
      query: {
        original: query,
        mode: `federated:${domain}`,
        limit: maxResults,
      },
      results: ranked,
      pagination: {
        page: 1,
        limit: maxResults,
        total: collected.length,
        has_more: collected.length > maxResults,
        next_cursor: null,
      },
      warnings,
      providers_queried: requestedIds,
      providers_succeeded: succeededProviders,
      providers_failed: failedProviders,
    };

    const summaryHeader = `[Federated Research (${domain}) | queried: ${requestedIds.join(", ")} | succeeded: ${succeededProviders.join(", ")}${isPartial ? ` | failed: ${failedProviders.join(", ")}` : ""}]`;

    return {
      providerId: succeededProviders.length === 1 ? succeededProviders[0] : "canonical",
      originalToolName: "waqf_research_search",
      isCacheHit: false,
      isPartial,
      result: {
        content: [
          {
            type: "text",
            text: `${summaryHeader}\n${JSON.stringify(
              {
                status,
                results: ranked.map((r) => ({
                  provider: r.provider,
                  title: r.work.title,
                  author: r.work.author,
                  page: r.location.printed_page_label ?? r.location.digital_page_number,
                  verbatim: r.content.verbatim,
                  citation_markdown: r.citation.citation_markdown,
                })),
                warnings,
              },
              null,
              2
            )}`,
          },
        ],
        structuredContent: envelope as unknown as Record<string, unknown>,
      },
    };
  }

  public isEmptyResult(result: ToolResult): boolean {
    if (result.structuredContent && (result.structuredContent as { status?: string }).status === "no_results") {
      return true;
    }
    if (!result.content || result.content.length === 0) {
      return true;
    }
    return result.content.every((block) => {
      if (block.type === "text") {
        const text = block.text.trim();
        if (!text || text === "[]" || text === "{}") {
          return true;
        }
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (Array.isArray(parsed) && parsed.length === 0) return true;
          if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.result) && parsed.result.length === 0) return true;
            if (Array.isArray(parsed.results) && parsed.results.length === 0) return true;
          }
        } catch {
          // Plain text content, non-empty
        }
      }
      return false;
    });
  }

  public async listAllResources(suite = "all"): Promise<ResourceDefinition[]> {
    if (suite === "turath" || suite === "search") {
      return [];
    }

    // Only providers that advertise resources in the catalog are queried.
    // Calling every upstream produced a failed subrequest and a warning per
    // request for servers that do not implement resources/list.
    let providers = this.registry
      .getAll()
      .filter((provider) => PROVIDERS_WITH_RESOURCES.has(provider.id));
    if (suite === "quran") {
      providers = providers.filter((p) => p.id === "tafsir_net" || p.id === "bahouth");
    }

    const settled = await Promise.allSettled(
      providers.map(async (provider) => {
        const resources = await this.registry.getProviderResources(provider);
        return resources.map((r) => ({
          ...r,
          description: `[${provider.name}] ${r.description ?? ""}`.trim(),
        }));
      })
    );

    const allResources: ResourceDefinition[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        allResources.push(...result.value);
        return;
      }
      warnProviderUnavailable("resources/list", providers[index].id, result.reason);
    });

    return allResources;
  }

  public async readResource(
    uri: string,
    cacheService?: D1CacheService,
    ctx?: ExecutionContext
  ): Promise<ReadResourceResponse> {
    let targetProviderId = "tafsir_net";
    let targetUri = uri;

    if (uri.startsWith("quran://")) {
      targetProviderId = "tafsir_net";
    } else if (uri.includes("__")) {
      const sep = uri.indexOf("__");
      targetProviderId = uri.slice(0, sep);
      targetUri = uri.slice(sep + 2);
    }

    const provider = this.registry.get(targetProviderId);
    if (!provider || !provider.readResource) {
      throw new Error(`No provider available to read resource: '${uri}'`);
    }

    // Cache lookup
    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey(targetProviderId, "read_resource", { uri: targetUri });
      const cached = await cacheService.get(cacheKey);
      if (cached && !cached.isError) {
        if (ctx) {
          ctx.waitUntil(cacheService.recordHit(cacheKey));
        } else {
          cacheService.recordHit(cacheKey).catch(() => {});
        }
        try {
          const parsed = JSON.parse(cached.content[0]?.type === "text" ? cached.content[0].text : "{}") as ReadResourceResult;
          if (parsed && Array.isArray(parsed.contents)) {
            return {
              providerId: targetProviderId,
              result: parsed,
              isCacheHit: true,
            };
          }
        } catch {
          // Fall through to live fetch
        }
      }
    }

    const result = await provider.readResource(targetUri);

    // Save to cache asynchronously if valid
    if (cacheService && cacheKey && result.contents && result.contents.length > 0) {
      const toolResultWrapper: ToolResult = {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
      if (ctx) {
        ctx.waitUntil(cacheService.set(cacheKey, targetProviderId, "read_resource", toolResultWrapper));
      } else {
        cacheService.set(cacheKey, targetProviderId, "read_resource", toolResultWrapper).catch(() => {});
      }
    }

    return {
      providerId: targetProviderId,
      result,
      isCacheHit: false,
    };
  }

  public async listAllPrompts(suite = "all"): Promise<PromptDefinition[]> {
    if (suite === "turath" || suite === "search") {
      return [];
    }

    let providers = this.registry
      .getAll()
      .filter((provider) => PROVIDERS_WITH_PROMPTS.has(provider.id));
    if (suite === "quran") {
      providers = providers.filter((p) => p.id === "tafsir_net" || p.id === "bahouth");
    }

    const settled = await Promise.allSettled(
      providers.map(async (provider) => {
        const prompts = await this.registry.getProviderPrompts(provider);
        return prompts.map((p) => ({
          ...p,
          description: `[${provider.name}] ${p.description ?? ""}`.trim(),
        }));
      })
    );

    const allPrompts: PromptDefinition[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        allPrompts.push(...result.value);
        return;
      }
      warnProviderUnavailable("prompts/list", providers[index].id, result.reason);
    });

    return allPrompts;
  }

  public async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<GetPromptResponse> {
    let targetProviderId = "tafsir_net";
    let targetPromptName = name;

    const sepIndex = name.indexOf("__");
    if (sepIndex !== -1) {
      targetProviderId = name.slice(0, sepIndex);
      targetPromptName = name.slice(sepIndex + 2);
    } else {
      targetProviderId = "tafsir_net";
    }

    const provider = this.registry.get(targetProviderId);
    if (!provider || !provider.getPrompt) {
      throw new Error(`No provider available to get prompt: '${name}'`);
    }

    const result = await provider.getPrompt(targetPromptName, args);
    return {
      providerId: targetProviderId,
      result,
    };
  }
}
