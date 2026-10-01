# Goal: Publish an API Catalog for Automated API Discovery (RFC 9727)

## Goal Description
Create /.well-known/api-catalog returning application/linkset+json with link relations for service-desc, service-doc, and status (RFC 9727).

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: markdown-negotiation-for-agents
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/api-catalog
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/publish-api-catalog/facts.md`](facts.md)
- **Execution Plan**: [`goals/publish-api-catalog/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
