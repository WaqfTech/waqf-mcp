# Goal: Support WebMCP to Expose Site Tools via Browser DOM API

## Goal Description
Support WebMCP to expose site tools to AI agents via browser DOM API (document.modelContext.registerTool) and declarative HTML form attributes.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: auth-md-agent-registration
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/src/layouts/BaseLayout.astro
- apps/web/src/components/SubmitForm.astro

## References
- **Shared Understanding & Fact Sheet**: [`goals/webmcp-browser-integration/facts.md`](facts.md)
- **Execution Plan**: [`goals/webmcp-browser-integration/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
