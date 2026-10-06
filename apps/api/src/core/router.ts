import type {
  GetPromptResult,
  PromptDefinition,
  ReadResourceResult,
  ResourceDefinition,
  ToolDefinition,
  ToolResult,
} from "@waqf/types";
import { ProviderRegistry } from "./registry";
import { SchemaNormalizer } from "./normalizer";
import type { D1CacheService } from "../services/cache";

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

export interface GetPromptResponse {
  providerId: string;
  result: GetPromptResult;
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

    const sanitizedArgs = this.normalizer.sanitizeProviderArgs(providerId, originalToolName, args);

    // Cache lookup
    let cacheKey: string | null = null;
    if (cacheService) {
      cacheKey = await cacheService.computeKey(providerId, originalToolName, sanitizedArgs);
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

    const result = await provider.callTool(originalToolName, sanitizedArgs);

    // Save to cache asynchronously if valid and non-empty
    if (cacheService && cacheKey && !result.isError && !this.isEmptyResult(result)) {
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

    let result: ToolResult = { content: [] };
    let targetProvider = "canonical";

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
              result = this.normalizer.normalizeToolResult(raw, "Tafsir.net");
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
          result = this.normalizer.normalizeToolResult(raw, "Bahouth");
          fetched = true;
        }

        if (!fetched) {
          throw new Error("No Quran provider available or all upstreams failed");
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

      case "waqf_search_scholarship": {
        const fihrisProvider = this.registry.get("fihris");
        const turathProvider = this.registry.get("turath");
        let fetched = false;

        // Primary: Fihris web search across Islamic directories
        if (fihrisProvider) {
          try {
            targetProvider = "fihris";
            const raw = await fihrisProvider.callTool("search_islamic_sources", args);
            if (!raw.isError) {
              result = this.normalizer.normalizeToolResult(raw, "Fihris Islamic Search");
              fetched = true;
            }
          } catch {
            // Fall through to Turath fallback
          }
        }

        // Resilient Fallback: Turath heritage library search if Fihris failed or had isError
        if (!fetched && turathProvider) {
          try {
            targetProvider = "turath";
            const query = String(args.query || args.q || "");
            const raw = await turathProvider.callTool("search_turath", { q: query });
            result = this.normalizer.normalizeToolResult(raw, "Turath Islamic Heritage (Scholarship Fallback)");
            fetched = true;
          } catch {
            // Fall through
          }
        }

        if (!fetched) {
          throw new Error("No scholarship search provider available or all upstreams failed");
        }
        break;
      }

      default:
        throw new Error(`Unhandled canonical tool: '${toolName}'`);
    }

    if (cacheService && cacheKey && !result.isError && !this.isEmptyResult(result)) {
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

  public isEmptyResult(result: ToolResult): boolean {
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

    let providers = this.registry.getAll();
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
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allResources.push(...result.value);
      }
    }

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

    let providers = this.registry.getAll();
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
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allPrompts.push(...result.value);
      }
    }

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
