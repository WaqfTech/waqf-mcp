# Goal: Return HTML Responses as Markdown for Agent Content Negotiation

## Goal Description
Return HTML responses as markdown when agents request it with Accept: text/markdown while preserving HTML for browsers.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: agent-discovery-link-headers
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/src/index.ts
- apps/api/test/e2e.test.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/markdown-negotiation-for-agents/facts.md`](facts.md)
- **Execution Plan**: [`goals/markdown-negotiation-for-agents/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
