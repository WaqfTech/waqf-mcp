# Goal: Publish Sitemap and Reference from robots.txt

## Goal Description
Generate /sitemap.xml listing canonical URLs, keep it updated on publish, and reference it from /robots.txt.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: content-signals-declaration
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/sitemap.xml
- apps/web/public/robots.txt

## References
- **Shared Understanding & Fact Sheet**: [`goals/publish-sitemap-xml/facts.md`](facts.md)
- **Execution Plan**: [`goals/publish-sitemap-xml/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
