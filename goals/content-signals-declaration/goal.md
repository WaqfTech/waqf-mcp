# Goal: Declare AI Content Usage Preferences with Content Signals in robots.txt

## Goal Description
Add Content-Signal directives to robots.txt declaring preferences for ai-train, search, and ai-input (e.g. Content-Signal: ai-train=no, search=yes, ai-input=yes).

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: ai-crawler-robots-rules
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/robots.txt

## References
- **Shared Understanding & Fact Sheet**: [`goals/content-signals-declaration/facts.md`](facts.md)
- **Execution Plan**: [`goals/content-signals-declaration/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
