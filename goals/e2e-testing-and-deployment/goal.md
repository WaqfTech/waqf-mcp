# Goal: End-to-End Verification and Deployment Preparation

## Goal Description
Add Vitest test suites, test live queries with curl and MCP inspector, verify D1 caching/logging, and prepare wrangler config for mcp.waqf.dev.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: canonical-schemas-and-caching, telemetry-and-logging, multilingual-landing-page
- **Sequence**: 7
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/test
- apps/api/wrangler.jsonc
- README.md

## References
- **Shared Understanding & Fact Sheet**: [`goals/e2e-testing-and-deployment/facts.md`](facts.md)
- **Execution Plan**: [`goals/e2e-testing-and-deployment/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
