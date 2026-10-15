import type {
  IMcpProvider,
  ProviderConfig,
  ToolDefinition,
  ToolResult,
  TransportProtocol,
} from "@waqf/types";

/**
 * Service bindings registered per provider id. A provider whose service lives in
 * this same Cloudflare account is better reached over the internal network than
 * through the public edge, which re-enters the zone and is subject to its rules —
 * the gateway received HTTP 522 that way while the same request succeeded from a
 * normal network. Absent a binding, providers keep using the public fetch.
 */
const requestFetchers = new Map<string, Fetcher>();

export function setRequestFetcher(providerId: string, fetcher: Fetcher): void {
  requestFetchers.set(providerId, fetcher);
}

export function clearRequestFetchers(): void {
  requestFetchers.clear();
}

export abstract class BaseMcpAdapter implements IMcpProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly baseUrl: string;
  public readonly description: string;
  public readonly transport: TransportProtocol;
  public readonly cacheTtlSeconds?: number;
  protected readonly timeoutMs: number;
  protected readonly defaultHeaders: Record<string, string>;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    // Normalize baseUrl: preserve protocol and path, strip trailing slash for consistent joining
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.description = config.description;
    this.transport = config.transport;
    this.cacheTtlSeconds = config.cacheTtlSeconds;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "WaqfMCP-Gateway/1.0 (+https://mcp.waqf.dev)",
      "X-Waqf-Federated-By": "mcp.waqf.dev",
      ...(config.headers ?? {}),
    };
  }

  abstract listTools(): Promise<ToolDefinition[]>;
  abstract callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;

  async listResources(): Promise<import("@waqf/types").ResourceDefinition[]> {
    return [];
  }

  async readResource(_uri: string): Promise<import("@waqf/types").ReadResourceResult> {
    throw new Error(`[${this.id}] readResource not supported`);
  }

  async listPrompts(): Promise<import("@waqf/types").PromptDefinition[]> {
    return [];
  }

  async getPrompt(_promptName: string, _args?: Record<string, string>): Promise<import("@waqf/types").GetPromptResult> {
    throw new Error(`[${this.id}] getPrompt not supported`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return Array.isArray(tools) && tools.length > 0;
    } catch {
      return false;
    }
  }

  protected async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = this.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const request = { ...init, signal: controller.signal };
    const bound = requestFetchers.get(this.id);

    try {
      return bound ? await bound.fetch(url, request) : await fetch(url, request);
    } finally {
      clearTimeout(timer);
    }
  }
}
