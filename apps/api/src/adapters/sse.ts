import { BaseMcpAdapter } from "./base";
import type { ToolDefinition, ToolResult } from "@waqf/types";

export class SseMcpAdapter extends BaseMcpAdapter {
  private endpointUrl(): string {
    // Preserve exact configured URL or ensure trailing slash if root
    return this.baseUrl.endsWith("/mcp") || this.baseUrl.endsWith("/")
      ? this.baseUrl
      : `${this.baseUrl}/`;
  }

  private parseResponsePayload(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed) as Record<string, unknown>;
    }

    // Parse SSE lines: find all "data:" lines and extract JSON
    const lines = rawText.split("\n");
    let accumulatedData = "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const chunk = line.slice(5).trim();
        if (chunk) {
          accumulatedData = chunk;
        }
      }
    }

    if (accumulatedData) {
      return JSON.parse(accumulatedData) as Record<string, unknown>;
    }

    throw new Error(`Unable to extract JSON payload from SSE stream: ${rawText.slice(0, 200)}`);
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
        id: "waqf-sse-list",
        method: "tools/list",
        params: {},
      }),
    });

    if (!res.ok) {
      throw new Error(`[${this.id}] SSE tools/list HTTP ${res.status}: ${await res.text()}`);
    }

    const text = await res.text();
    const parsed = this.parseResponsePayload(text) as {
      result?: { tools?: ToolDefinition[] };
      error?: { message?: string };
    };

    if (parsed.error) {
      throw new Error(`[${this.id}] SSE tools/list error: ${parsed.error.message ?? "Unknown error"}`);
    }

    return parsed.result?.tools ?? [];
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
        id: "waqf-sse-call",
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
            text: `[${this.id}] SSE upstream HTTP ${res.status} error: ${errorText}`,
          },
        ],
      };
    }

    const text = await res.text();
    const parsed = this.parseResponsePayload(text) as {
      result?: ToolResult;
      error?: { message?: string };
    };

    if (parsed.error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[${this.id}] SSE upstream error: ${parsed.error.message ?? "Unknown error"}`,
          },
        ],
      };
    }

    if (parsed.result?.content) {
      return parsed.result;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(parsed.result ?? parsed),
        },
      ],
    };
  }
}
