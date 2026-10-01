# Facts: Scaffold Fullstack Cloudflare Monorepo with Aube

## Architectural Invariants & Constraints
- Never use npm; always use aube
- Zero root dumping
- Runtime type isolation (DOM isolated to apps/web, Worker types isolated to apps/api)

## File & Interface Contracts
- Relevant files:
  - `pnpm-workspace.yaml`
  - `package.json`
  - `tsconfig.base.json`
  - `apps/api`
  - `apps/web`
  - `packages/db`
  - `packages/types`
