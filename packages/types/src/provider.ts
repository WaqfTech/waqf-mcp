export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ResourceContent {
  type: "resource";
  resource: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
}

export type ContentBlock = TextContent | ImageContent | ResourceContent;

export interface ToolResult {
  content: ContentBlock[];
  isError?: boolean;
}

export type TransportProtocol = "json-rpc" | "sse";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  transport: TransportProtocol;
  description: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface IMcpProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly description: string;
  readonly transport: TransportProtocol;

  listTools(): Promise<ToolDefinition[]>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  healthCheck(): Promise<boolean>;
}
