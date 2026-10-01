# Goal: Implement Non-Blocking Request Telemetry Logger

## Goal Description
Capture rich request analytics (IP hash, Geo, ASN, latency, tool calls, errors) and log to D1 inside ctx.waitUntil.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: monorepo-scaffold, d1-database-schema, core-mcp-federation-engine
- **Sequence**: 5
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/src/services/telemetry.ts
- apps/api/src/middleware/logger.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/telemetry-and-logging/facts.md`](facts.md)
- **Execution Plan**: [`goals/telemetry-and-logging/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
