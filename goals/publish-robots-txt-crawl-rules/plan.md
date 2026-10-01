# Plan: Publish /robots.txt with Clear Crawl Rules

## Execution Steps
- [x] **Phase 1**: 1. Create apps/web/public/robots.txt with explicit User-agent and path rules
- [x] **Phase 2**: 2. Expose GET /robots.txt in apps/api/src/index.ts and verify text/plain response
- [x] **Phase 3**: 3. Add integration test and verify live HTTP 200
