# Goal: Publish OAuth/OIDC Discovery Metadata for Protected APIs

## Goal Description
Publish OAuth 2.0 / OIDC discovery metadata at /.well-known/oauth-authorization-server for protected endpoints (RFC 8414).

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: agent-skills-discovery-index
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/oauth-authorization-server
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/oauth-oidc-discovery-metadata/facts.md`](facts.md)
- **Execution Plan**: [`goals/oauth-oidc-discovery-metadata/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
