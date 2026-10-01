# Execution Plan: Gateway Telemetry Analytics Endpoint

- [ ] 1. Add `getAggregatedMetrics(timeWindowHours: number)` method to `D1TelemetryService` querying `mcp_logs` with efficient SQL aggregations.
- [ ] 2. Register route handler for `GET /api/stats` in `apps/api/src/index.ts` with bearer token validation using `env.ADMIN_API_KEY`.
- [ ] 3. Write unit tests in `apps/api/test/telemetry.test.ts` verifying auth enforcement and metrics payload structure.
- [ ] 4. Run `aube test` and certify goal.
