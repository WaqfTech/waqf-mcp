# Goal: Publish Agent Skills Discovery Index (RFC v0.2.0)

## Goal Description
Publish a skills discovery index at /.well-known/agent-skills/index.json per Cloudflare Agent Skills Discovery RFC v0.2.0 with sha256 digests.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: agentic-resource-discovery-manifest
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/.well-known/agent-skills/index.json
- apps/api/src/index.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/agent-skills-discovery-index/facts.md`](facts.md)
- **Execution Plan**: [`goals/agent-skills-discovery-index/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
