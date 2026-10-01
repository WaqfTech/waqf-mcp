# Goal: Include Link Response Headers for Agent Discovery (RFC 8288)

## Goal Description
Add Link response headers (RFC 8288) to homepage and API responses pointing agents to API catalog, MCP server card, and documentation.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: publish-sitemap-xml
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/agent-discovery-link-headers/facts.md`](facts.md)
- **Execution Plan**: [`goals/agent-discovery-link-headers/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
