import type {
  IMcpProvider,
  ProviderConfig,
  ToolDefinition,
  ToolResult,
  TransportProtocol,
} from "@waqf/types";

export abstract class BaseMcpAdapter implements IMcpProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly baseUrl: string;
  public readonly description: string;
  public readonly transport: TransportProtocol;
  protected readonly timeoutMs: number;
  protected readonly defaultHeaders: Record<string, string>;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    // Normalize baseUrl: preserve protocol and path, strip trailing slash for consistent joining
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.description = config.description;
    this.transport = config.transport;
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

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
