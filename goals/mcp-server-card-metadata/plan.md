# Plan: Publish an MCP Server Card (SEP-1649) for Agent Discovery

## Execution Steps
- [ ] **Phase 1**: 1. Define server-card.json conforming to SEP-1649 with serverInfo, transports, and capabilities
- [ ] **Phase 2**: 2. Serve at /.well-known/mcp/server-card.json via apps/api/src/index.ts and apps/web/public
- [ ] **Phase 3**: 3. Write unit tests in apps/api/test/e2e.test.ts verifying SEP-1649 server card
