# Facts: Implement Canonical Schema Normalization and D1 Caching

## Architectural Invariants & Constraints
- D1 cache with SHA-256 keys and configurable TTL
- Support both canonical waqf_* tools and namespaced tools
- Suite query parameter filtering (?suite=core vs ?suite=all)

## File & Interface Contracts
- Relevant files:
  - `apps/api/src/canonical`
  - `apps/api/src/core/normalizer.ts`
  - `apps/api/src/services/cache.ts`
