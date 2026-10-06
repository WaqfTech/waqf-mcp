import { ProviderRegistry } from "./core/registry";
import { FederationRouter } from "./core/router";
import { D1CacheService } from "./services/cache";
import { D1TelemetryService } from "./services/telemetry";
import { createDb, mcpSubmissions } from "@waqf/db";
import { eq, desc } from "drizzle-orm";
import { LLMS_TXT, LLMS_FULL_TXT } from "./llms";
import { ROBOTS_TXT } from "./robots";
import { SITEMAP_XML } from "./sitemap";
import { API_CATALOG_JSON } from "./api-catalog";
import { MCP_SERVER_CARD_JSON } from "./server-card";
import { AI_CATALOG_JSON } from "./ai-catalog";
import { AGENT_SKILLS_INDEX_JSON } from "./agent-skills";
import {
  OAUTH_AUTH_SERVER_JSON,
  OAUTH_PROTECTED_RESOURCE_JSON,
  handleOAuthRegister,
  handleOAuthAuthorize,
  handleOAuthToken,
} from "./oauth";
import { AUTH_MD } from "./auth-doc";

export interface Env {
  DB: D1Database;
  TELEMETRY_SALT?: string;
  WEB?: Fetcher;
  ADMIN_API_KEY?: string;
}

// Module-level hoisting per cf-cpu-audit: compile once per isolate
const registry = new ProviderRegistry();
const router = new FederationRouter(registry);
const textEncoder = new TextEncoder();

const submissionRateLimits = new Map<string, number[]>();

export function isSubmissionRateLimited(ip: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;
  const timestamps = (submissionRateLimits.get(ip) || []).filter((t) => t > oneHourAgo);
  if (timestamps.length >= 5) {
    submissionRateLimits.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  submissionRateLimits.set(ip, timestamps);
  return false;
}

export function resetSubmissionRateLimits(): void {
  submissionRateLimits.clear();
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
  ...SECURITY_HEADERS,
};

function checkAdminAuth(request: Request, env: Env): Response | null {
  const expectedKey = env.ADMIN_API_KEY;
  if (!expectedKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Admin API key not configured on server" }),
      { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token !== expectedKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  return null;
}

export const AGENT_DISCOVERY_LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</llms.txt>; rel="service-doc"; type="text/markdown"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
  '</.well-known/ai-catalog.json>; rel="item"; type="application/json"',
].join(", ");

const DISCOVERY_HEADERS = {
  ...CORS_HEADERS,
  Link: AGENT_DISCOVERY_LINK_HEADER,
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

    if (request.method === "GET" && pathname === "/auth.md") {
      return new Response(AUTH_MD, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/robots.txt") {
      return new Response(ROBOTS_TXT, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...CORS_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/sitemap.xml") {
      return new Response(SITEMAP_XML, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...CORS_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/.well-known/api-catalog") {
      return new Response(API_CATALOG_JSON, {
        headers: {
          "Content-Type": "application/linkset+json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/.well-known/mcp/server-card.json") {
      return new Response(MCP_SERVER_CARD_JSON, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/.well-known/ai-catalog.json") {
      return new Response(AI_CATALOG_JSON, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/.well-known/agent-skills/index.json") {
      return new Response(AGENT_SKILLS_INDEX_JSON, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (
      request.method === "GET" &&
      (pathname === "/.well-known/oauth-authorization-server" ||
        pathname === "/.well-known/openid-configuration")
    ) {
      return new Response(OAUTH_AUTH_SERVER_JSON, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "GET" && pathname === "/.well-known/oauth-protected-resource") {
      return new Response(OAUTH_PROTECTED_RESOURCE_JSON, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    if (request.method === "POST" && pathname === "/oauth/register") {
      return handleOAuthRegister(request, CORS_HEADERS);
    }

    if ((request.method === "GET" || request.method === "POST" || request.method === "HEAD") && pathname === "/oauth/authorize") {
      return handleOAuthAuthorize(request, CORS_HEADERS);
    }

    if (request.method === "POST" && pathname === "/oauth/token") {
      return handleOAuthToken(request, CORS_HEADERS);
    }

    if (request.method === "GET" && pathname === "/.well-known/jwks.json") {
      return new Response(JSON.stringify({ keys: [] }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          ...CORS_HEADERS,
        },
      });
    }

    // Markdown for Agents content negotiation (https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
    const accept = request.headers.get("accept") || "";
    if (request.method === "GET" && accept.includes("text/markdown")) {
      const approxTokens = Math.ceil(LLMS_TXT.length / 4);
      return new Response(LLMS_TXT, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "x-markdown-tokens": approxTokens.toString(),
          Vary: "Accept",
          "Cache-Control": "public, max-age=3600",
          ...DISCOVERY_HEADERS,
        },
      });
    }

    // Health, Info, and MCP GET Discovery / SSE Endpoint
    if (
      request.method === "GET" &&
      (pathname === "/" || pathname === "/health" || pathname === "/mcp" || pathname === "/sse")
    ) {
      const accept = request.headers.get("accept") || "";
      const userAgent = request.headers.get("user-agent") || "";
      const isSocialCrawler =
        /twitterbot|facebookexternalhit|linkedinbot|telegrambot|whatsapp|slackbot|discordbot|applebot|bingbot|googlebot/i.test(
          userAgent
        );

      // If browser or social crawler accesses root "/" preferring HTML, delegate to Astro web worker via service binding
      const isHtmlPreferred = (accept.includes("text/html") || isSocialCrawler) && !accept.includes("application/json");
      if (pathname === "/" && isHtmlPreferred && env.WEB) {
        const res = await env.WEB.fetch(request);
        const headers = new Headers(res.headers);
        headers.set("Link", AGENT_DISCOVERY_LINK_HEADER);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
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
            ...DISCOVERY_HEADERS,
          },
        });
      }

      // JSON discovery for browser inspection & curl
      return new Response(
        JSON.stringify(
          {
            status: "healthy",
            name: "Islamic Sources (@IslamicSources) — Waqf MCP Gateway",
            version: "1.0.0",
            protocolVersion: "2024-11-05",
            endpoint: "/mcp",
            role: "aggregator",
            disclaimer: {
              type: "as-is-aggregator",
              statement:
                "Islamic Sources (@IslamicSources) is strictly an aggregator and federation gateway. We do not own, manage, or operate upstream Islamic MCP servers, nor do we author, add, edit, or alter their responses. All content is transmitted verbatim and the service is provided strictly on an 'as-is' basis without warranties. The Waqf license governs the gateway code only; each upstream provider maintains its own license and terms.",
            },
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
            capabilities: [
              "tools (tools/list, tools/call)",
              "resources (resources/list, resources/read)",
              "prompts (prompts/list, prompts/get)",
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
            ...DISCOVERY_HEADERS,
          },
        }
      );
    }

    // Community MCP Submission API Endpoint
    if (request.method === "POST" && pathname === "/api/submissions") {
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
      if (isSubmissionRateLimited(clientIp)) {
        return new Response(
          JSON.stringify({ error: "Too many submissions from this IP. Limit is 5 per hour." }),
          { status: 429, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

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

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.submitterEmail)) {
          return new Response(
            JSON.stringify({ error: "Invalid submitterEmail format" }),
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

          const existing = await db
            .select({ id: mcpSubmissions.id })
            .from(mcpSubmissions)
            .where(eq(mcpSubmissions.serverUrl, body.serverUrl))
            .limit(1);

          if (existing.length > 0) {
            return new Response(
              JSON.stringify({ error: "An MCP server with this URL has already been submitted" }),
              { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

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

    // Admin List Submissions Endpoint
    if (request.method === "GET" && pathname === "/api/submissions") {
      const authErr = checkAdminAuth(request, env);
      if (authErr) return authErr;

      if (!env.DB) {
        return new Response(
          JSON.stringify({ error: "Database not configured" }),
          { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

      try {
        const db = createDb(env.DB);
        const statusParam = url.searchParams.get("status") || "pending";
        const limitParam = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || "50")));

        const allowedStatuses = ["pending", "verified", "rejected"] as const;
        const baseQuery = db.select().from(mcpSubmissions);

        const submissions =
          statusParam === "all"
            ? await baseQuery.orderBy(desc(mcpSubmissions.createdAt)).limit(limitParam)
            : allowedStatuses.includes(statusParam as (typeof allowedStatuses)[number])
              ? await baseQuery
                  .where(eq(mcpSubmissions.status, statusParam as (typeof allowedStatuses)[number]))
                  .orderBy(desc(mcpSubmissions.createdAt))
                  .limit(limitParam)
              : await baseQuery
                  .where(eq(mcpSubmissions.status, "pending"))
                  .orderBy(desc(mcpSubmissions.createdAt))
                  .limit(limitParam);

        return new Response(JSON.stringify(submissions, null, 2), {
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

    // Admin Review Submissions Endpoint
    if (request.method === "PATCH" && pathname === "/api/submissions") {
      const authErr = checkAdminAuth(request, env);
      if (authErr) return authErr;

      if (!env.DB) {
        return new Response(
          JSON.stringify({ error: "Database not configured" }),
          { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }

      try {
        const body = (await request.json()) as { id?: string; status?: string };
        if (!body.id || !body.status) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: id, status" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        const allowedStatuses = ["pending", "verified", "rejected"] as const;
        if (!allowedStatuses.includes(body.status as (typeof allowedStatuses)[number])) {
          return new Response(
            JSON.stringify({ error: "Invalid status: must be pending, verified, or rejected" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        const db = createDb(env.DB);
        const updated = await db
          .update(mcpSubmissions)
          .set({ status: body.status as (typeof allowedStatuses)[number] })
          .where(eq(mcpSubmissions.id, body.id))
          .returning();

        if (updated.length === 0) {
          return new Response(
            JSON.stringify({ error: "Submission not found" }),
            { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, submission: updated[0] }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
      const authErr = checkAdminAuth(request, env);
      if (authErr) return authErr;

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
        errorMsg: string | null,
        responseSizeBytes: number | null = null
      ) => {
        if (!telemetryService) return;
        const latencyMs = Math.round(performance.now() - startTime);

        let toolArgumentsJson = toolArgs ? JSON.stringify(toolArgs) : null;
        if (toolArgumentsJson && toolArgumentsJson.length > 2000) {
          toolArgumentsJson = toolArgumentsJson.slice(0, 1997) + "...";
        }

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
              toolArgumentsJson,
              upstreamProvider: provider,
              isCacheHit,
              statusCode,
              latencyMs,
              errorMessage: errorMsg,
              responseSizeBytes,
            });
          })().catch(() => {})
        );
      };

      const jsonResponse = (payload: unknown, status = 200) => {
        const bodyStr = JSON.stringify(payload);
        const bytes = textEncoder.encode(bodyStr).length;
        return {
          response: new Response(bodyStr, {
            status,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          }),
          bytes,
        };
      };

      try {
        switch (rpc.method) {
          case "initialize": {
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: {
                    listChanged: false,
                  },
                  resources: {
                    subscribe: false,
                    listChanged: false,
                  },
                  prompts: {
                    listChanged: false,
                  },
                },
                serverInfo: {
                  name: "IslamicSources",
                  version: "1.0.0",
                },
              },
            });
            logExecution("initialize", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "notifications/initialized": {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
          }

          case "ping": {
            const resData = jsonResponse({ jsonrpc: "2.0", id: reqId, result: {} });
            logExecution("ping", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "tools/list": {
            const tools = await router.listAllTools(suite);
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                tools,
              },
            });
            logExecution("tools/list", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "tools/call": {
            const params = rpc.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
            if (!params?.name) {
              const resData = jsonResponse({
                jsonrpc: "2.0",
                id: reqId,
                error: { code: -32602, message: "Missing required tool 'name' parameter" },
              });
              logExecution("tools/call", null, null, null, false, 400, "Missing tool name", resData.bytes);
              return resData.response;
            }

            const { providerId, result, isCacheHit } = await router.callTool(
              params.name,
              params.arguments ?? {},
              cacheService,
              ctx
            );

            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result,
            });

            logExecution(
              "tools/call",
              params.name,
              params.arguments ?? {},
              providerId,
              isCacheHit,
              result.isError ? 500 : 200,
              result.isError ? "Tool execution error" : null,
              resData.bytes
            );

            return resData.response;
          }

          case "resources/list": {
            const resources = await router.listAllResources(suite);
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                resources,
              },
            });
            logExecution("resources/list", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "resources/read": {
            const params = rpc.params as { uri?: string } | undefined;
            if (!params?.uri) {
              const resData = jsonResponse({
                jsonrpc: "2.0",
                id: reqId,
                error: { code: -32602, message: "Missing required 'uri' parameter" },
              });
              logExecution("resources/read", null, null, null, false, 400, "Missing resource uri", resData.bytes);
              return resData.response;
            }

            const { providerId, result, isCacheHit } = await router.readResource(
              params.uri,
              cacheService,
              ctx
            );

            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result,
            });

            logExecution(
              "resources/read",
              params.uri,
              null,
              providerId,
              isCacheHit,
              200,
              null,
              resData.bytes
            );

            return resData.response;
          }

          case "prompts/list": {
            const prompts = await router.listAllPrompts(suite);
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                prompts,
              },
            });
            logExecution("prompts/list", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "prompts/get": {
            const params = rpc.params as { name?: string; arguments?: Record<string, string> } | undefined;
            if (!params?.name) {
              const resData = jsonResponse({
                jsonrpc: "2.0",
                id: reqId,
                error: { code: -32602, message: "Missing required prompt 'name' parameter" },
              });
              logExecution("prompts/get", null, null, null, false, 400, "Missing prompt name", resData.bytes);
              return resData.response;
            }

            const { providerId, result } = await router.getPrompt(
              params.name,
              params.arguments ?? {}
            );

            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result,
            });

            logExecution(
              "prompts/get",
              params.name,
              (params.arguments as Record<string, unknown>) ?? null,
              providerId,
              false,
              200,
              null,
              resData.bytes
            );

            return resData.response;
          }

          default: {
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              error: { code: -32601, message: `Method '${rpc.method}' not found` },
            });
            logExecution(rpc.method, null, null, null, false, 404, "Method not found", resData.bytes);
            return resData.response;
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const resData = jsonResponse({
          jsonrpc: "2.0",
          id: reqId,
          error: { code: -32603, message: `Internal error: ${errorMsg}` },
        });
        logExecution(rpc.method, null, null, null, false, 500, errorMsg, resData.bytes);
        return resData.response;
      }
    }

    // Delegate non-API web routes (e.g. /en, /tr, /id, /ms, /_astro/*) to Astro web worker
    if (env.WEB) {
      const res = await env.WEB.fetch(request);
      if (
        pathname === "/" ||
        pathname === "/ar" ||
        pathname === "/en" ||
        pathname === "/tr" ||
        pathname === "/id" ||
        pathname === "/ms"
      ) {
        const headers = new Headers(res.headers);
        headers.set("Link", AGENT_DISCOVERY_LINK_HEADER);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      return res;
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};
