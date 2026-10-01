# Facts: Build Core SOLID MCP Federation Engine and Adapters

## Architectural Invariants & Constraints
- SOLID Dependency Inversion Principle
- Zero Durable Objects - pure stateless Streamable HTTP
- Pass-through streaming without memory buffering
- Module-level hoisting of schemas and configurations

## File & Interface Contracts
- Relevant files:
  - `apps/api/src/adapters`
  - `apps/api/src/core`
  - `apps/api/src/config`
  - `apps/api/src/index.ts`
  - `apps/api/wrangler.jsonc`
