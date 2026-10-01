# Plan: Publish Auth.md Metadata for Agent Registration

## Execution Steps
- [x] **Phase 1**: 1. Create apps/web/public/auth.md detailing agent registration, scopes, and authentication headers
- [x] **Phase 2**: 2. Expose GET /auth.md in apps/api/src/index.ts with text/markdown; charset=utf-8
- [x] **Phase 3**: 3. Write unit tests in apps/api/test/e2e.test.ts verifying auth.md accessibility
