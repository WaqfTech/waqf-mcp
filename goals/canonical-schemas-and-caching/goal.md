# Goal: Implement Canonical Schema Normalization and D1 Caching

## Goal Description
Map divergent upstream schemas (get_verse vs fetch_ayah, list-books vs get_book) into waqf_* canonical tools and integrate D1 caching.

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: core-mcp-federation-engine
- **Sequence**: 4
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- apps/api/src/canonical
- apps/api/src/core/normalizer.ts
- apps/api/src/services/cache.ts

## References
- **Shared Understanding & Fact Sheet**: [`goals/canonical-schemas-and-caching/facts.md`](facts.md)
- **Execution Plan**: [`goals/canonical-schemas-and-caching/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
