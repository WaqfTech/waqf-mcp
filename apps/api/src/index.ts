export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response(JSON.stringify({ status: "ok", name: "Waqf MCP Gateway" }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
