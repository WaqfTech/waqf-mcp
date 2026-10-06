import type {
  IMcpProvider,
  PromptDefinition,
  ProviderConfig,
  ResourceDefinition,
  ToolDefinition,
} from "@waqf/types";
import { JsonRpcMcpAdapter } from "../adapters/jsonrpc";
import { SseMcpAdapter } from "../adapters/sse";
import { UPSTREAM_PROVIDERS } from "../config/providers.config";

export class ProviderRegistry {
  private providers = new Map<string, IMcpProvider>();
  private toolsCache = new Map<string, { tools: ToolDefinition[]; timestamp: number }>();
  private resourcesCache = new Map<string, { resources: ResourceDefinition[]; timestamp: number }>();
  private promptsCache = new Map<string, { prompts: PromptDefinition[]; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in isolate memory

  constructor(configs: ProviderConfig[] = UPSTREAM_PROVIDERS) {
    for (const config of configs) {
      if (config.enabled !== false) {
        this.registerConfig(config);
      }
    }
  }

  public register(provider: IMcpProvider): void {
    this.providers.set(provider.id, provider);
  }

  public registerConfig(config: ProviderConfig): void {
    if (config.transport === "sse") {
      this.register(new SseMcpAdapter(config));
    } else {
      this.register(new JsonRpcMcpAdapter(config));
    }
  }

  public get(id: string): IMcpProvider | undefined {
    return this.providers.get(id);
  }

  public getAll(): IMcpProvider[] {
    return Array.from(this.providers.values());
  }

  public async getProviderTools(provider: IMcpProvider): Promise<ToolDefinition[]> {
    const cached = this.toolsCache.get(provider.id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.tools;
    }

    try {
      const tools = await provider.listTools();
      this.toolsCache.set(provider.id, { tools, timestamp: now });
      return tools;
    } catch (err) {
      // If fresh fetch fails, return stale cached tools if available
      if (cached) {
        return cached.tools;
      }
      throw err;
    }
  }

  public async getProviderResources(provider: IMcpProvider): Promise<ResourceDefinition[]> {
    if (!provider.listResources) return [];
    const cached = this.resourcesCache.get(provider.id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.resources;
    }

    try {
      const resources = await provider.listResources();
      this.resourcesCache.set(provider.id, { resources, timestamp: now });
      return resources;
    } catch (err) {
      if (cached) {
        return cached.resources;
      }
      throw err;
    }
  }

  public async getProviderPrompts(provider: IMcpProvider): Promise<PromptDefinition[]> {
    if (!provider.listPrompts) return [];
    const cached = this.promptsCache.get(provider.id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.prompts;
    }

    try {
      const prompts = await provider.listPrompts();
      this.promptsCache.set(provider.id, { prompts, timestamp: now });
      return prompts;
    } catch (err) {
      if (cached) {
        return cached.prompts;
      }
      throw err;
    }
  }
}
