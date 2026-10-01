# Goal: Publish Auth.md Metadata for Agent Registration

## Goal Description
Publish /auth.md at site root with autonomous agent registration instructions, API key acquisition guidelines, and rate limit tiers.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: oauth-protected-resource-metadata
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/auth.md
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/auth-md-agent-registration/facts.md`](facts.md)
- **Execution Plan**: [`goals/auth-md-agent-registration/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
