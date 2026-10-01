# Goal: Secure Gateway Telemetry & Health Analytics API Endpoint

## Goal Description
Implement an authenticated read-only endpoint (`GET /api/stats` or `GET /api/telemetry`) protected by an admin API key or Cloudflare Access token, returning aggregated metrics computed from `mcp_logs` in D1 (total volume, cache hit ratio, tool latency breakdown, provider error rates).

## Dependencies & Execution Order
- **Mode**: Dependent 🔗
- **Depends On**: telemetry-and-logging
- **Shape**: ship
- **Tier**: roadmap

## Files to Touch
- `apps/api/src/index.ts`
- `apps/api/src/services/telemetry.ts`
- `apps/api/test/telemetry.test.ts`

## References
- **Shared Understanding & Fact Sheet**: [`goals/gateway-telemetry-dashboard-endpoint/facts.md`](facts.md)
- **Execution Plan**: [`goals/gateway-telemetry-dashboard-endpoint/plan.md`](plan.md)

## Done Condition
1. `GET /api/stats` without authorization returns `HTTP 401 Unauthorized`.
2. `GET /api/stats` with valid `Bearer <ADMIN_API_KEY>` returns JSON payload with aggregated metrics.
3. Queries use indexed lookups (`idx_mcp_logs_timestamp`) and avoid full-table scans.
4. Unit and e2e tests pass.
