import { CORS_HEADERS } from "./http";

export interface AdminEnv {
  ADMIN_API_KEY?: string;
}

/** Bearer-token guard for the admin-only analytics endpoints. */
export function checkAdminAuth(request: Request, env: AdminEnv): Response | null {
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
