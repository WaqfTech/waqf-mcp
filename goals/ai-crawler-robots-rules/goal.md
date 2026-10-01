# Goal: Add User-Agent Rules for AI Crawlers in robots.txt

## Goal Description
Add explicit User-agent entries for AI crawlers (OAI-SearchBot, Claude-SearchBot, GPTBot, ClaudeBot, PerplexityBot, Google-Extended) with clear allow/disallow rules.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: publish-robots-txt-crawl-rules
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/public/robots.txt

## References
- **Shared Understanding & Fact Sheet**: [`goals/ai-crawler-robots-rules/facts.md`](facts.md)
- **Execution Plan**: [`goals/ai-crawler-robots-rules/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
