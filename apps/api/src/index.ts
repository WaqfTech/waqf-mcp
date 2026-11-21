import { ProviderRegistry } from "./core/registry";
import { FederationRouter } from "./core/router";
import {
  MODERN_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  buildDiscoverResult,
  buildInitializeResult,
  withCompleteResult,
} from "./core/server-metadata";
import { AGENT_DISCOVERY_LINK_HEADER, CORS_HEADERS, DISCOVERY_HEADERS } from "./http";
import { checkAdminAuth } from "./admin";
import { handleCacheStatsRequest } from "./routes/cache-stats";
import { handleStatsAggregateRequest } from "./routes/stats-aggregate";
import { proxyWebRequest } from "./routes/web-proxy";
import { runScheduledAggregation } from "./services/stats";
import { setRequestFetcher } from "./adapters/base";
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
  SEARCHER?: Fetcher;
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

// Not exported: the Worker entry module may only export handlers.
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

    // Same-account upstream: reach the searcher Worker over the internal network
    // rather than the public edge. Registering is idempotent and cheap, so it is
    // re-applied per request and stays correct if the isolate predates the binding.
    if (env.SEARCHER) {
      setRequestFetcher("fihris", env.SEARCHER);
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Arabic is served at the root; /ar/ is an advertised-but-absent URL and must
    // not 404 for links, hreflang consumers or bookmarks.
    if ((request.method === "GET" || request.method === "HEAD") && pathname === "/ar") {
      return Response.redirect(`${url.origin}/`, 301);
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
        // The gateway is stateless and never sends server-initiated messages,
        // so return the endpoint event as a finite body. Holding a
        // TransformStream open forever made the Workers runtime cancel
        // GET /mcp as a hung request (HTTP 503) for SSE clients.
        const postEndpoint = `${url.origin}/mcp`;
        const sseBody = `retry: 3600000\nevent: endpoint\ndata: ${postEndpoint}\n\n`;

        return new Response(sseBody, {
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
            protocolVersion: MODERN_PROTOCOL_VERSION,
            supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
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
              llms: "https://mcp.waqf.app/llms.txt",
              llmsFull: "https://mcp.waqf.app/llms-full.txt",
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
              core: "High-level normalized canonical tools (waqf_quran_get_ayah, waqf_hadith_search, waqf_turath_search_books, waqf_search_scholarship, waqf_books_search, waqf_books_read_page)",
              quran: "Quran & Tafsir specialized suite",
              turath: "Hadith, Islamic heritage and classical books suite (Turath, Maher Al-Fahel, Aljam3, Shamela)",
              search: "Scholarly web search across vetted Islamic portals (Fihris)",
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
        console.error("[submissions] insert failed:", err);
        return new Response(JSON.stringify({ error: "Submission could not be saved" }), {
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

    // Authenticated Cache Inventory Endpoint
    if (request.method === "GET" && pathname === "/api/cache/stats") {
      return handleCacheStatsRequest(request, env);
    }

    // Authenticated Daily Rollup Backfill
    if (request.method === "POST" && pathname === "/api/stats/aggregate") {
      return handleStatsAggregateRequest(request, env);
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

      const jsonResponse = (
        payload: unknown,
        status = 200,
        extraMeta?: Record<string, unknown>
      ) => {
        const bodyStr = JSON.stringify(withCompleteResult(payload, extraMeta));
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
          case "server/discover": {
            // MCP 2026 clients probe discovery before initialize. Answer with
            // the versions this gateway actually implements instead of a
            // method-not-found, so clients can negotiate down cleanly.
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: buildDiscoverResult(),
            });
            logExecution("server/discover", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "initialize": {
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: buildInitializeResult(),
            });
            logExecution("initialize", null, null, "internal", false, 200, null, resData.bytes);
            return resData.response;
          }

          case "notifications/initialized": {
            // The Streamable HTTP transport requires 202 Accepted with no body
            // for a notification the server accepts.
            return new Response(null, { status: 202, headers: CORS_HEADERS });
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

            const responseTimeMs = Math.round(performance.now() - startTime);
            const resData = jsonResponse(
              {
                jsonrpc: "2.0",
                id: reqId,
                result,
              },
              200,
              {
                responseTimeMs,
                cacheHit: isCacheHit,
                ...(result.error ? { errorCode: result.error.code } : {}),
              }
            );

            // Tool execution errors are valid MCP results (HTTP 200 with
            // isError), not gateway failures. Record the real status and keep
            // the reason in error_message so error-rate counts stay honest.
            const toolErrorText = result.isError
              ? result.content
                  .filter((block) => block.type === "text")
                  .map((block) => (block.type === "text" ? block.text : ""))
                  .join(" ")
                  .slice(0, 1000) || "Tool execution error"
              : null;

            logExecution(
              "tools/call",
              params.name,
              params.arguments ?? {},
              providerId,
              isCacheHit,
              200,
              toolErrorText,
              resData.bytes
            );

            return resData.response;
          }

          case "resources/templates/list": {
            // No provider in the catalog declares parameterized resource
            // templates. Advertise the empty set rather than method-not-found:
            // clients probe this method unconditionally after initialize.
            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result: {
                resourceTemplates: [],
              },
            });
            logExecution(
              "resources/templates/list",
              null,
              null,
              "internal",
              false,
              200,
              null,
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

            // MCP prompt arguments are strings, but clients routinely send
            // numbers (surah: 1). Coerce once here so upstream prompt
            // validators do not reject an otherwise valid call.
            const promptArgs = Object.fromEntries(
              Object.entries(params.arguments ?? {}).map(([key, value]) => [
                key,
                String(value),
              ])
            );

            const { providerId, result } = await router.getPrompt(
              params.name,
              promptArgs
            );

            const resData = jsonResponse({
              jsonrpc: "2.0",
              id: reqId,
              result,
            });

            logExecution(
              "prompts/get",
              params.name,
              promptArgs,
              providerId,
              false,
              200,
              null,
              resData.bytes
            );

            return resData.response;
          }

          default: {
            // Every notification the gateway accepts gets 202 with no body.
            // Returning a JSON-RPC error here made clients retry and inflated
            // protocol-error counts (notifications/roots/list_changed alone
            // produced 10,251 false 404s in seven days).
            if (rpc.method.startsWith("notifications/")) {
              return new Response(null, { status: 202, headers: CORS_HEADERS });
            }

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
          error: { code: -32603, message: "Internal error" },
        });
        logExecution(rpc.method, null, null, null, false, 500, errorMsg, resData.bytes);
        return resData.response;
      }
    }

    // Delegate non-API web routes (e.g. /en, /tr, /id, /ms, /_astro/*) to Astro web worker.
    if (env.WEB) {
      return proxyWebRequest(request, env.WEB, pathname);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    runScheduledAggregation(env, ctx);
  },
};
