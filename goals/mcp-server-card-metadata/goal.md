# Goal: Publish an MCP Server Card (SEP-1649) for Agent Discovery

## Goal Description
Serve an MCP Server Card (SEP-1649) at /.well-known/mcp/server-card.json with serverInfo, transport endpoint, and capabilities.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: publish-api-catalog
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/mcp/server-card.json
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/mcp-server-card-metadata/facts.md`](facts.md)
- **Execution Plan**: [`goals/mcp-server-card-metadata/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
