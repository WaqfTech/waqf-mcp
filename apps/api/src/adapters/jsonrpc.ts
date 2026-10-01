import { BaseMcpAdapter } from "./base";
import type { ToolDefinition, ToolResult } from "@waqf/types";

export class JsonRpcMcpAdapter extends BaseMcpAdapter {
  private endpointUrl(): string {
    // If the base URL ends with a known resource, keep it, otherwise append slash if needed
    return this.baseUrl.endsWith("/mcp") ? this.baseUrl : `${this.baseUrl}/mcp/`;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const url = this.endpointUrl();
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...this.defaultHeaders,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "waqf-list-tools",
        method: "tools/list",
        params: {},
      }),
    });

    if (!res.ok && res.status !== 307 && res.status !== 308) {
      throw new Error(`[${this.id}] tools/list failed with HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      result?: { tools?: ToolDefinition[] };
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`[${this.id}] tools/list RPC error: ${data.error.message ?? "Unknown error"}`);
    }

    return data.result?.tools ?? [];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const url = this.endpointUrl();
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...this.defaultHeaders,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "waqf-call-tool",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[${this.id}] Upstream HTTP ${res.status} error: ${errorText}`,
          },
        ],
      };
    }

    const data = (await res.json()) as {
      result?: ToolResult;
      error?: { code?: number; message?: string };
    };

    if (data.error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[${this.id}] Upstream RPC error: ${data.error.message ?? "Unknown error"}`,
          },
        ],
      };
    }

    if (data.result?.content) {
      return data.result;
    }

    // Default fallback wrapper
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data.result ?? data),
        },
      ],
    };
  }
}
