# Plan: Publish OAuth/OIDC Discovery Metadata for Protected APIs

## Execution Steps
- [ ] **Phase 1**: 1. Define oauth-authorization-server JSON metadata with issuer, token_endpoint, and supported grants
- [ ] **Phase 2**: 2. Expose via apps/api/src/index.ts and apps/web/public
- [ ] **Phase 3**: 3. Write unit tests in apps/api/test/e2e.test.ts verifying RFC 8414 metadata
