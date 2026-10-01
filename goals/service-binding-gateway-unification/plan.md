# Execution Plan: Unified Domain Routing via Service Binding

- [x] 1. Add Service Binding definition to `apps/api/wrangler.jsonc` (`binding: "WEB", service: "waqf-mcp-web"`).
- [x] 2. Update `Env` interface in `apps/api/src/index.ts` (or `@waqf/types`) to include optional `WEB?: Fetcher`.
- [x] 3. Implement routing logic in `apps/api/src/index.ts`:
  - Check `Accept` header on `GET /` to distinguish `application/json` (discovery) from `text/html` (web landing).
  - Forward non-API, non-MCP requests to `env.WEB.fetch(request)` if `env.WEB` is present.
- [x] 4. Add unit and E2E test cases in `apps/api/test/e2e.test.ts` verifying service binding delegation and content negotiation.
- [x] 5. Run `aube test` and `aube run typecheck` to verify zero regressions.
- [x] 6. Deploy to Cloudflare Workers (`aube run deploy:api`) and verify through `scripts/live-test-suite.sh`.
