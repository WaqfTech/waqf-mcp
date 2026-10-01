# Fact Sheet: Unified Domain Routing via Service Binding

## Context & Finding
Under Cloudflare Worker Custom Domains, an entire hostname (such as `mcp.waqf.dev`) can only bind directly to a single Worker.
To serve both the human-facing multilingual landing portal (from `apps/web`) and the machine-facing MCP API gateway (from `apps/api`) under the single unified domain `mcp.waqf.dev`, we utilize Cloudflare **Service Bindings**.

## Architecture (Option 1: Gateway Front-Door)
- `waqf-mcp-api` is assigned the custom domain `mcp.waqf.dev`.
- `waqf-mcp-api` configures a service binding to `waqf-mcp-web`:
  ```jsonc
  "services": [
    {
      "binding": "WEB",
      "service": "waqf-mcp-web"
    }
  ]
  ```
- **Zero Overhead**: Calls to `env.WEB.fetch(request)` execute in-memory within the same Cloudflare edge V8 isolate.

## Content Negotiation & Routing Specification
1. **MCP Protocols (`/mcp`)**:
   - `POST /mcp` -> JSON-RPC Streamable HTTP.
   - `GET /mcp` -> SSE stream (if `Accept: text/event-stream`) or Discovery JSON.
   - `OPTIONS /mcp` -> CORS preflight (HTTP 204).
2. **Submissions API (`/api/*`)**:
   - Handled directly by `waqf-mcp-api`.
3. **Root URL (`/`) Content Negotiation**:
   - If `Accept` header contains `application/json` (curl, AI bots, MCP clients inspecting gateway):
     Return JSON discovery metadata.
   - Otherwise (browsers with `Accept: text/html`):
     Forward to `env.WEB.fetch(request)` (Astro multilingual landing page).
4. **Web Portal Routes (`/en/*`, `/tr/*`, `/id/*`, `/ms/*`, `/_astro/*`, etc.)**:
   - If `env.WEB` exists: Forward directly to `env.WEB.fetch(request)`.
   - If `env.WEB` is not bound (e.g. unit test mocks without web): Return HTTP 404.
