import { ProviderRegistry } from "./core/registry";
import { FederationRouter } from "./core/router";
import { D1CacheService } from "./services/cache";
import { D1TelemetryService } from "./services/telemetry";
import { createDb, mcpSubmissions } from "@waqf/db";
import { LLMS_TXT, LLMS_FULL_TXT } from "./llms";

export interface Env {
  DB: D1Database;
  TELEMETRY_SALT?: string;
  WEB?: Fetcher;
  ADMIN_API_KEY?: string;
}

// Module-level hoisting per cf-cpu-audit: compile once per isolate
const registry = new ProviderRegistry();
const router = new FederationRouter(registry);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
  ...SECURITY_HEADERS,
};

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = performance.now();
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Standard LLM / AI Agent Discovery Endpoints
    if (request.method === "GET" && pathname === "/llms.txt") {
      return new Response(LLMS_TXT, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...CORS_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/llms-full.txt") {
      return new Response(LLMS_FULL_TXT, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...CORS_HEADERS,
        },
      });
    }

    // Health, Info, and MCP GET Discovery / SSE Endpoint
    if (
      request.method === "GET" &&
      (pathname === "/" || pathname === "/health" || pathname === "/mcp" || pathname === "/sse")
    ) {
      const accept = request.headers.get("accept") || "";

      // If browser accesses root "/" preferring HTML, delegate to Astro web worker via service binding
      const isHtmlPreferred = accept.includes("text/html") && !accept.includes("application/json");
      if (pathname === "/" && isHtmlPreferred && env.WEB) {
        return env.WEB.fetch(request);
      }

      // Support SSE (Server-Sent Events) clients
      if (accept.includes("text/event-stream")) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // Send endpoint event per MCP SSE spec
        const postEndpoint = `${url.origin}/mcp`;
        writer.write(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...CORS_HEADERS,
          },
        });
      }

      // JSON discovery for browser inspection & curl
      return new Response(
        JSON.stringify(
          {
            status: "healthy",
            name: "WaqfTech(); Islamic MCP Federation Gateway",
            version: "1.0.0",
            protocolVersion: "2024-11-05",
            endpoint: "/mcp",
            organization: {
              name: "WaqfTech();",
              tagline: "Open-source Waqf Technology Foundation",
              website: "https://waqftech.org/",
              developerPortal: "https://dev.waqftech.org/",
              social: {
                x: "https://x.com/waqftechorg",
                github: "https://github.com/waqftech",
              },
            },
            links: {
              portal: "https://mcp.waqf.dev/",
              documentation: "https://mcp.waqf.dev/#setup",
              llms: "https://mcp.waqf.dev/llms.txt",
              llmsFull: "https://mcp.waqf.dev/llms-full.txt",
              submitMcp: "https://mcp.waqf.dev/#submit",
              repository: "https://github.com/waqftech/waqf-mcp",
              license: "https://github.com/WaqfTech/waqf-license-draft",
            },
            transports: [
              "streamable-http (POST /mcp)",
              "sse (GET /mcp with Accept: text/event-stream)",
            ],
            runtime: {
              engine: "Cloudflare Workers (Stateless Edge V8)",
              database: "Cloudflare D1 SQLite",
              caching: "Edge D1 Cache (mcp_cache)",
              telemetry: "Non-blocking Edge Logging (mcp_logs via ctx.waitUntil)",
            },
            usage: "Send JSON-RPC 2.0 requests via POST /mcp (e.g. initialize, tools/list, tools/call)",
            suites: {
              all: "All available upstream tools across federated Islamic servers",
              core: "High-level normalized canonical tools (waqf_quran_get_ayah, waqf_hadith_search, waqf_turath_search_books, waqf_search_scholarship)",
              quran: "Quran & Tafsir specialized suite",
              turath: "Hadith & Islamic Heritage library suite",
              search: "Scholarly web search across 38+ verified Islamic portals (Fihris)",
            },
            stats: {
              federatedProvidersCount: registry.getAll().length,
              availableSuites: ["core", "quran", "turath", "search", "all"],
            },
            federatedProviders: registry.getAll().map((p) => ({
              id: p.id,
              name: p.name,
              transport: p.transport,
              description: p.description,
            })),
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // Community MCP Submission API Endpoint
    if (request.method === "POST" && pathname === "/api/submissions") {
      try {
        const body = (await request.json()) as {
          submitterName: string;
          submitterEmail: string;
          serverName: string;
          serverUrl: string;
          description: string;
          category: "quran" | "hadith" | "tafsir" | "fiqh" | "tools";
        };

        if (!body.serverUrl || !body.serverName || !body.submitterEmail) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: serverUrl, serverName, submitterEmail" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Validate field lengths to prevent storage abuse
        if (
          body.serverName.length > 100 ||
          (body.submitterName && body.submitterName.length > 100) ||
          body.submitterEmail.length > 255 ||
          body.serverUrl.length > 500 ||
          (body.description && body.description.length > 2000)
        ) {
          return new Response(
            JSON.stringify({ error: "One or more fields exceed maximum allowed character length" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Validate URL format (must be valid HTTP/HTTPS)
        if (!body.serverUrl.startsWith("https://") && !body.serverUrl.startsWith("http://")) {
          return new Response(
            JSON.stringify({ error: "serverUrl must start with https:// or http://" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        const validCategories = ["quran", "hadith", "tafsir", "fiqh", "tools"] as const;
        const category = validCategories.includes(body.category) ? body.category : "tools";

        if (env.DB) {
          const db = createDb(env.DB);
          await db.insert(mcpSubmissions).values({
            id: crypto.randomUUID(),
            submitterName: body.submitterName || "Anonymous",
            submitterEmail: body.submitterEmail,
            serverName: body.serverName,
            serverUrl: body.serverUrl,
            description: body.description ?? "",
            category,
            status: "pending",
            createdAt: new Date().toISOString(),
          });
        }

        return new Response(
          JSON.stringify({ success: true, message: "MCP submission received successfully" }),
          { status: 201, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
    }

    // Authenticated Gateway Telemetry & Analytics Endpoint
    if (request.method === "GET" && (pathname === "/api/stats" || pathname === "/api/telemetry")) {
      const authHeader = request.headers.get("authorization") || "";
      const expectedKey = env.ADMIN_API_KEY || "waqf-telemetry-key-2026";

      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!token || token !== expectedKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }),
          { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

      try {
        const timeWindowHours = Math.max(1, Math.min(720, Number(url.searchParams.get("hours") || "24")));
        const telemetry = new D1TelemetryService(env.DB, env.TELEMETRY_SALT);
        const stats = await telemetry.getAggregatedMetrics(timeWindowHours);

        return new Response(JSON.stringify(stats, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
    }

    // MCP Streamable HTTP / POST Endpoint
    if (request.method === "POST" && (pathname === "/mcp" || pathname === "/")) {
      // Enforce 1MB request body limit to prevent memory exhaustion
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 1024 * 1024) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Invalid Request: Payload exceeds 1MB limit" },
          }),
          { status: 413, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

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
      const cacheService = env.DB ? new D1CacheService(env.DB) : undefined;
      const telemetryService = env.DB ? new D1TelemetryService(env.DB, env.TELEMETRY_SALT) : undefined;

      // Extract CF Edge Metadata
      const cf = (request as unknown as { cf?: IncomingRequestCfProperties }).cf;
      const userAgent = request.headers.get("user-agent");
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";

      const logExecution = (
        method: string,
        toolName: string | null,
        toolArgs: Record<string, unknown> | null,
        provider: string | null,
        isCacheHit: boolean,
        statusCode: number,
        errorMsg: string | null
      ) => {
        if (!telemetryService) return;
        const latencyMs = Math.round(performance.now() - startTime);

        ctx.waitUntil(
          (async () => {
            const clientIpHash = await telemetryService.hashIp(clientIp);
            await telemetryService.log({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              clientIpHash,
              country: cf?.country ?? null,
              city: cf?.city ?? null,
              region: cf?.region ?? null,
              asn: cf?.asn ? Number(cf.asn) : null,
              colo: cf?.colo ?? null,
              userAgent,
              transportType: "http-post",
              clientApp: telemetryService.detectClientApp(userAgent),
              method,
              toolName,
              toolArgumentsJson: toolArgs ? JSON.stringify(toolArgs) : null,
              upstreamProvider: provider,
              isCacheHit,
              statusCode,
              latencyMs,
              errorMessage: errorMsg,
              responseSizeBytes: null,
            });
          })().catch(() => {})
        );
      };

      try {
        switch (rpc.method) {
          case "initialize": {
            logExecution("initialize", null, null, "internal", false, 200, null);
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
            logExecution("tools/list", null, null, "internal", false, 200, null);
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
              logExecution("tools/call", null, null, null, false, 400, "Missing tool name");
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: reqId,
                  error: { code: -32602, message: "Missing required tool 'name' parameter" },
                }),
                { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
              );
            }

            const { providerId, result, isCacheHit } = await router.callTool(
              params.name,
              params.arguments ?? {},
              cacheService,
              ctx
            );

            logExecution(
              "tools/call",
              params.name,
              params.arguments ?? {},
              providerId,
              isCacheHit,
              result.isError ? 500 : 200,
              result.isError ? "Tool execution error" : null
            );

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
            logExecution(rpc.method, null, null, null, false, 404, "Method not found");
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: reqId,
                error: { code: -32601, message: `Method '${rpc.method}' not found` },
              }),
              { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logExecution(rpc.method, null, null, null, false, 500, errorMsg);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: reqId,
            error: { code: -32603, message: `Internal error: ${errorMsg}` },
          }),
          { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // Delegate non-API web routes (e.g. /en, /tr, /id, /ms, /_astro/*) to Astro web worker
    if (env.WEB) {
      return env.WEB.fetch(request);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};
