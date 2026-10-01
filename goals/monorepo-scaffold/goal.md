# Goal: Scaffold Fullstack Cloudflare Monorepo with Aube

## Goal Description
Setup pnpm-workspace.yaml, apps/api, apps/web, packages/db, packages/types with isolated tsconfigs and zero DOM leakage using aube.

## Dependencies & Execution Order
- **Mode**: Independent (disjoint, parallelizable)
- **Depends On**: none
- **Sequence**: 1
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- pnpm-workspace.yaml
- package.json
- tsconfig.base.json
- apps/api
- apps/web
- packages/db
- packages/types

## References
- **Shared Understanding & Fact Sheet**: [`goals/monorepo-scaffold/facts.md`](facts.md)
- **Execution Plan**: [`goals/monorepo-scaffold/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
