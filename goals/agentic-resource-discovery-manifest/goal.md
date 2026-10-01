# Goal: Publish an ARD (Agentic Resource Discovery) Capability Manifest

## Goal Description
Serve /.well-known/ai-catalog.json at origin root with ARD manifest format (urn:air:mcp.waqf.dev, specVersion, representativeQueries, endpoints).

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: mcp-server-card-metadata
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/ai-catalog.json
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/agentic-resource-discovery-manifest/facts.md`](facts.md)
- **Execution Plan**: [`goals/agentic-resource-discovery-manifest/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
