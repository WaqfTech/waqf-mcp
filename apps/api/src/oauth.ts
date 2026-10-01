export const OAUTH_AUTH_SERVER_JSON = JSON.stringify(
  {
    issuer: "https://mcp.waqf.dev",
    authorization_endpoint: "https://mcp.waqf.dev/oauth/authorize",
    token_endpoint: "https://mcp.waqf.dev/oauth/token",
    registration_endpoint: "https://mcp.waqf.dev/oauth/register",
    jwks_uri: "https://mcp.waqf.dev/.well-known/jwks.json",
    response_types_supported: ["code", "token"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
    ],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: ["mcp:read", "mcp:tools", "telemetry:read", "admin"],
    service_documentation: "https://mcp.waqf.dev/auth.md",
    ui_locales_supported: ["ar", "en", "tr", "id", "ms"],
    agent_auth: {
      registration_uri: "https://mcp.waqf.dev/oauth/register",
      public_access: true,
      description:
        "All Islamic MCP tool discovery and execution endpoints are open without authentication. Dynamic Client Registration (RFC 7591) is enabled for automatic AI client connections.",
    },
  },
  null,
  2
);

export const OAUTH_PROTECTED_RESOURCE_JSON = JSON.stringify(
  {
    resource: "https://mcp.waqf.dev",
    authorization_servers: ["https://mcp.waqf.dev"],
    scopes_supported: ["mcp:read", "mcp:tools", "telemetry:read", "admin"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://mcp.waqf.dev/auth.md",
  },
  null,
  2
);

/**
 * Handle RFC 7591 OAuth 2.0 Dynamic Client Registration
 */
export async function handleOAuthRegister(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // If empty or non-JSON body, use defaults
  }

  const clientId = `waqf_client_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const clientSecret = `waqf_secret_${crypto.randomUUID().replace(/-/g, "")}`;
  const clientName = (body.client_name as string) || "MCP Client";
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  const registrationResponse = {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token", "client_credentials"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };

  return new Response(JSON.stringify(registrationResponse, null, 2), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...corsHeaders,
    },
  });
}

/**
 * Handle OAuth 2.0 / 2.1 Authorization Endpoint (/oauth/authorize)
 * Automatically approves authorization for public Islamic knowledge access.
 */
export function handleOAuthAuthorize(request: Request, corsHeaders: Record<string, string>): Response {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  const authCode = `waqf_code_${crypto.randomUUID().replace(/-/g, "")}`;

  if (redirectUri) {
    try {
      const target = new URL(redirectUri);
      target.searchParams.set("code", authCode);
      if (state) {
        target.searchParams.set("state", state);
      }
      return Response.redirect(target.toString(), 302);
    } catch {
      // Invalid URL provided in redirect_uri
    }
  }

  // Fallback: render HTML consent confirmation if accessed directly in a browser
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Waqf MCP — Authorization</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 24px; text-align: center; color: #112b38; background: #eef5f2; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    h1 { font-size: 20px; color: #2e7d76; }
    p { color: #555; font-size: 14px; line-height: 1.6; }
    .badge { display: inline-block; background: #c6ee67; color: #112b38; font-weight: bold; padding: 4px 12px; border-radius: 999px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Open Access</div>
    <h1>Islamic Sources (@IslamicSources)</h1>
    <p>This MCP server provides unrestricted public read access to authentic Islamic knowledge sources (Quran, Tafsir, Hadith, Scholarly Search).</p>
    <p>Authorization is granted automatically.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders,
    },
  });
}

/**
 * Handle OAuth 2.0 / 2.1 Token Endpoint (/oauth/token)
 */
export async function handleOAuthToken(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
  const token = `waqf_token_${crypto.randomUUID().replace(/-/g, "")}`;
  const refreshToken = `waqf_refresh_${crypto.randomUUID().replace(/-/g, "")}`;

  const tokenResponse = {
    access_token: token,
    token_type: "Bearer",
    expires_in: 31536000, // 1 year
    refresh_token: refreshToken,
    scope: "mcp:tools mcp:read",
  };

  return new Response(JSON.stringify(tokenResponse, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...corsHeaders,
    },
  });
}
