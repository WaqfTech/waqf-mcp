# Plan: Publish an API Catalog for Automated API Discovery (RFC 9727)

## Execution Steps
- [ ] **Phase 1**: 1. Create apps/web/public/.well-known/api-catalog with linkset array referencing /mcp, /llms.txt, and /api/stats
- [ ] **Phase 2**: 2. Expose endpoint in apps/api/src/index.ts with application/linkset+json header
- [ ] **Phase 3**: 3. Write unit tests in apps/api/test/e2e.test.ts verifying RFC 9727 linkset compliance
