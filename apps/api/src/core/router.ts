import type { ToolDefinition, ToolResult } from "@waqf/types";
import { ProviderRegistry } from "./registry";

export class FederationRouter {
  constructor(private registry: ProviderRegistry) {}

  public async listAllTools(suite = "all"): Promise<ToolDefinition[]> {
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

    const aggregated: ToolDefinition[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        aggregated.push(...result.value);
      }
    }

    if (suite === "quran") {
      return aggregated.filter(
        (t) => t.name.startsWith("bahouth__") || t.name.startsWith("tafsir_net__")
      );
    }

    if (suite === "turath") {
      return aggregated.filter(
        (t) => t.name.startsWith("turath__") || t.name.startsWith("maheralfahel__")
      );
    }

    return aggregated;
  }

  public async callTool(fullName: string, args: Record<string, unknown>): Promise<{
    providerId: string;
    originalToolName: string;
    result: ToolResult;
  }> {
    const separatorIndex = fullName.indexOf("__");
    if (separatorIndex === -1) {
      throw new Error(`Invalid tool name format: '${fullName}'. Expected '{provider}__{toolName}'`);
    }

    const providerId = fullName.slice(0, separatorIndex);
    const originalToolName = fullName.slice(separatorIndex + 2);

    const provider = this.registry.get(providerId);
    if (!provider) {
      throw new Error(`Unknown upstream provider: '${providerId}' in tool '${fullName}'`);
    }

    const result = await provider.callTool(originalToolName, args);
    return {
      providerId,
      originalToolName,
      result,
    };
  }
}
