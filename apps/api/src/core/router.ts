import type { ToolDefinition, ToolResult } from "@waqf/types";
import { ProviderRegistry } from "./registry";
import { SchemaNormalizer } from "./normalizer";
import type { D1CacheService } from "../services/cache";

export interface CallToolResponse {
  providerId: string;
  originalToolName: string;
  result: ToolResult;
  isCacheHit: boolean;
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
        }));
      })
    );

    const namespaced: ToolDefinition[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        namespaced.push(...result.value);
      }
    }

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
        ...canonicalTools.filter((t) => t.name.startsWith("waqf_turath") || t.name.startsWith("waqf_hadith")),
        ...namespaced.filter(
          (t) => t.name.startsWith("turath__") || t.name.startsWith("maheralfahel__")
        ),
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
      return this.handleCanonicalCall(fullName, args, cacheService, ctx);
    }

    // 2. Namespaced Tool Dispatch
    const separatorIndex = fullName.indexOf("__");
    if (separatorIndex === -1) {
      throw new Error(`Invalid tool name format: '${fullName}'. Expected 'waqf_*' or '{provider}__{toolName}'`);
    }

    const providerId = fullName.slice(0, separatorIndex);
    const originalToolName = fullName.slice(separatorIndex + 2);

    const provider = this.registry.get(providerId);
    if (!provider) {
      throw new Error(`Unknown upstream provider: '${providerId}' in tool '${fullName}'`);
    }

    // Cache lookup
    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey(providerId, originalToolName, args);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        if (ctx) {
          ctx.waitUntil(cacheService.recordHit(cacheKey));
        } else {
          cacheService.recordHit(cacheKey).catch(() => {});
        }
        return {
          providerId,
          originalToolName,
          result: cached,
          isCacheHit: true,
        };
      }
    }

    const result = await provider.callTool(originalToolName, args);

    // Save to cache asynchronously
    if (cacheService && cacheKey && !result.isError) {
      if (ctx) {
        ctx.waitUntil(cacheService.set(cacheKey, providerId, originalToolName, result));
      } else {
        cacheService.set(cacheKey, providerId, originalToolName, result).catch(() => {});
      }
    }

    return {
      providerId,
      originalToolName,
      result,
      isCacheHit: false,
    };
  }

  private async handleCanonicalCall(
    toolName: string,
    args: Record<string, unknown>,
    cacheService?: D1CacheService,
    ctx?: ExecutionContext
  ): Promise<CallToolResponse> {
    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey("canonical", toolName, args);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        if (ctx) {
          ctx.waitUntil(cacheService.recordHit(cacheKey));
        } else {
          cacheService.recordHit(cacheKey).catch(() => {});
        }
        return {
          providerId: "canonical",
          originalToolName: toolName,
          result: cached,
          isCacheHit: true,
        };
      }
    }

    let result: ToolResult;
    let targetProvider = "canonical";

    switch (toolName) {
      case "waqf_quran_get_ayah": {
        const surah = Number(args.surah);
        const ayah = Number(args.ayah);
        const tafsirProvider = this.registry.get("tafsir_net");
        const bahouthProvider = this.registry.get("bahouth");

        if (tafsirProvider) {
          targetProvider = "tafsir_net";
          const upstreamArgs = this.normalizer.toTafsirNetAyahArgs({
            surah,
            ayah,
            includeTafsir: Boolean(args.includeTafsir),
          });
          const raw = await tafsirProvider.callTool("fetch_ayah", upstreamArgs);
          result = this.normalizer.normalizeToolResult(raw, "Tafsir.net");
        } else if (bahouthProvider) {
          targetProvider = "bahouth";
          const raw = await bahouthProvider.callTool("get_verse", {
            verse_key: this.normalizer.toBahouthVerseKey({ surah, ayah }),
          });
          result = this.normalizer.normalizeToolResult(raw, "Bahouth");
        } else {
          throw new Error("No Quran provider available");
        }
        break;
      }

      case "waqf_turath_search_books": {
        const turathProvider = this.registry.get("turath");
        if (!turathProvider) {
          throw new Error("Turath provider not configured");
        }
        targetProvider = "turath";
        const query = String(args.query ?? "");
        const raw = await turathProvider.callTool("discover_turath", {
          q: query,
          kind: args.kind ?? "books",
        });
        result = this.normalizer.normalizeToolResult(raw, "Turath Library");
        break;
      }

      case "waqf_hadith_search": {
        const turathProvider = this.registry.get("turath");
        if (!turathProvider) {
          throw new Error("Hadith/Turath provider not configured");
        }
        targetProvider = "turath";
        const query = String(args.query ?? "");
        const raw = await turathProvider.callTool("search_turath", {
          q: query,
        });
        result = this.normalizer.normalizeToolResult(raw, "Hadith Sources (Turath)");
        break;
      }

      default:
        throw new Error(`Unhandled canonical tool: '${toolName}'`);
    }

    if (cacheService && cacheKey && !result.isError) {
      if (ctx) {
        ctx.waitUntil(cacheService.set(cacheKey, "canonical", toolName, result));
      } else {
        cacheService.set(cacheKey, "canonical", toolName, result).catch(() => {});
      }
    }

    return {
      providerId: targetProvider,
      originalToolName: toolName,
      result,
      isCacheHit: false,
    };
  }
}
