# Plan: Include Link Response Headers for Agent Discovery (RFC 8288)

## Execution Steps
- [x] **Phase 1**: 1. Add Link response headers to root and /mcp endpoints in apps/api/src/index.ts
- [x] **Phase 2**: 2. Point to /.well-known/api-catalog, /llms.txt, and /.well-known/mcp/server-card.json
- [x] **Phase 3**: 3. Write unit tests in apps/api/test/e2e.test.ts verifying Link headers
