# Plan: Return HTML Responses as Markdown for Agent Content Negotiation

## Execution Steps
- [ ] **Phase 1**: 1. Implement Accept: text/markdown negotiation in apps/api/src/index.ts
- [ ] **Phase 2**: 2. Format clean markdown summary representation of portal with metadata and tool catalog
- [ ] **Phase 3**: 3. Add x-markdown-tokens and Content-Type: text/markdown response headers
- [ ] **Phase 4**: 4. Write integration tests in apps/api/test/e2e.test.ts verifying content negotiation
