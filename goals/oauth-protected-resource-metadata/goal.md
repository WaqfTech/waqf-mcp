# Goal: Publish OAuth Protected Resource Metadata (RFC 9728)

## Goal Description
Publish OAuth Protected Resource Metadata (RFC 9728) at /.well-known/oauth-protected-resource.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: oauth-oidc-discovery-metadata
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/oauth-protected-resource
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/oauth-protected-resource-metadata/facts.md`](facts.md)
- **Execution Plan**: [`goals/oauth-protected-resource-metadata/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
