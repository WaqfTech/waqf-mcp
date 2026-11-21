import { AGENT_DISCOVERY_LINK_HEADER, CORS_HEADERS } from "../http";

const PAGE_PATHS = new Set(["/", "/ar", "/en", "/tr", "/id", "/ms"]);

/**
 * Delegate page requests to the Astro web worker. The timeout keeps a stalled
 * web worker from turning a scanner or page request into an unbounded API
 * invocation. The Link header is only added to human-facing page responses.
 */
export async function proxyWebRequest(
  request: Request,
  web: Fetcher,
  pathname: string
): Promise<Response> {
  try {
    const webRequest = new Request(request, { signal: AbortSignal.timeout(8000) });
    const res = await web.fetch(webRequest);
    if (PAGE_PATHS.has(pathname)) {
      const headers = new Headers(res.headers);
      headers.set("Link", AGENT_DISCOVERY_LINK_HEADER);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
    return res;
  } catch (err: unknown) {
    console.error("[web] delegation failed:", err);
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
