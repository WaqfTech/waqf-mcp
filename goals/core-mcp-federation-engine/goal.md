# Goal: Build Core SOLID MCP Federation Engine and Adapters

## Goal Description
Implement IMcpProvider, BaseMcpAdapter, JsonRpcMcpAdapter, SseMcpAdapter, ProviderRegistry, and FederationRouter in apps/api.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: monorepo-scaffold, d1-database-schema
- **Sequence**: 3
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/src/adapters
- apps/api/src/core
- apps/api/src/config
- apps/api/src/index.ts
- apps/api/wrangler.jsonc

## References
- **Shared Understanding & Fact Sheet**: [`goals/core-mcp-federation-engine/facts.md`](facts.md)
- **Execution Plan**: [`goals/core-mcp-federation-engine/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
