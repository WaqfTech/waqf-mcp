# Goal: Build Multi-lingual Astro Landing Page with WaqfTech Tokens

## Goal Description
Create Arabic-first landing page with English, Turkish, Indonesian, and Malaysian locales in lang/{lang}.json, client setup guides, and submission form.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: monorepo-scaffold
- **Sequence**: 6
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/web/src/components
- apps/web/src/layouts
- apps/web/src/pages
- apps/web/src/lang
- apps/web/astro.config.mjs

## References
- **Shared Understanding & Fact Sheet**: [`goals/multilingual-landing-page/facts.md`](facts.md)
- **Execution Plan**: [`goals/multilingual-landing-page/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
