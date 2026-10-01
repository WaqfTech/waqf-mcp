# Execution Plan: Align JSON-RPC HTTP Response Envelopes

- [ ] 1. Update `apps/api/src/index.ts` unknown method handler (`default:`) to return `status: 200` with JSON-RPC error `-32601`.
- [ ] 2. Update `apps/api/src/index.ts` missing tool name validation in `tools/call` to return `status: 200` with JSON-RPC error `-32602`.
- [ ] 3. Update `apps/api/test/e2e.test.ts` to assert `status: 200` on method not found while checking `error.code === -32601`.
- [ ] 4. Run `aube test` and `scripts/live-test-suite.sh` to certify and attribute commit.
