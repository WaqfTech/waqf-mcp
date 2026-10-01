import { ProviderRegistry } from "./core/registry";
import { FederationRouter } from "./core/router";

export interface Env {
  DB: D1Database;
}

// Module-level hoisting per cf-cpu-audit: compile once per isolate
const registry = new ProviderRegistry();
const router = new FederationRouter(registry);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
};

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health and info endpoint
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response(
        JSON.stringify({
          status: "healthy",
          name: "Waqf Islamic MCP Federation Gateway",
          version: "1.0.0",
          endpoint: "/mcp",
          providers: registry.getAll().map((p) => ({
            id: p.id,
            name: p.name,
            transport: p.transport,
            description: p.description,
          })),
        }, null, 2),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // MCP Streamable HTTP / POST Endpoint
    if (request.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/")) {
      let rpc: JsonRpcRequest;
      try {
        rpc = (await request.json()) as JsonRpcRequest;
      } catch {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: Invalid JSON payload" },
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

      const reqId = rpc.id ?? null;
      const suite = url.searchParams.get("suite") ?? "all";

      try {
        switch (rpc.method) {
          case "initialize": {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  protocolVersion: "2024-11-05",
                  capabilities: {
                    tools: {
                      listChanged: false,
                    },
                  },
                  serverInfo: {
                    name: "waqf-islamic-federation",
                    version: "1.0.0",
                  },
                },
              }),
              { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

          case "notifications/initialized": {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
          }

          case "ping": {
            return new Response(
              JSON.stringify({ jsonrpc: "2.0", id: reqId, result: {} }),
              { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

          case "tools/list": {
            const tools = await router.listAllTools(suite);
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result: {
                  tools,
                },
              }),
              { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

          case "tools/call": {
            const params = rpc.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
            if (!params?.name) {
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: reqId,
                  error: { code: -32602, message: "Missing required tool 'name' parameter" },
                }),
                { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
              );
            }

            const { result } = await router.callTool(params.name, params.arguments ?? {});
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                result,
              }),
              { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

          default: {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                error: { code: -32601, message: `Method '${rpc.method}' not found` },
              }),
              { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: reqId,
            error: { code: -32603, message: `Internal error: ${errorMsg}` },
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};
