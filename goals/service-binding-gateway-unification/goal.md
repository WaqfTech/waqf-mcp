# Goal: Unified Domain Routing via Service Binding from Gateway to Web

## Goal Description
Bind `waqf-mcp-web` into `waqf-mcp-api` as a Cloudflare Service Binding (`env.WEB`), allowing `mcp.waqf.dev` to act as the single production domain for both the web portal and the MCP protocol. Implement content negotiation on `/` and zero-latency routing delegation for all web assets.

## Dependencies & Execution Order
- **Mode**: Independent ⚡
- **Depends On**: none
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- `apps/api/wrangler.jsonc`
- `apps/api/src/index.ts`
- `apps/api/test/e2e.test.ts`
- `scripts/live-test-suite.sh`

## References
- **Shared Understanding & Fact Sheet**: [`goals/service-binding-gateway-unification/facts.md`](facts.md)
- **Execution Plan**: [`goals/service-binding-gateway-unification/plan.md`](plan.md)

## Done Condition
1. `apps/api/wrangler.jsonc` binds `waqf-mcp-web` via `services: [{ binding: "WEB", service: "waqf-mcp-web" }]`.
2. `apps/api/src/index.ts` delegates to `env.WEB.fetch(request)` for HTML browser traffic on `/` and all web routes.
3. `apps/api/src/index.ts` preserves JSON discovery for `GET /` with `Accept: application/json`.
4. Unit and E2E tests verify content negotiation and mock service binding delegation.
5. Deployed live and verified on Cloudflare Workers.
