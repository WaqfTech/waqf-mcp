# Goal: Align JSON-RPC HTTP Response Envelopes with MCP Streamable HTTP Spec

## Goal Description
Standardize HTTP response envelopes on `/mcp` so that JSON-RPC level errors (`-32601 Method Not Found`, `-32602 Invalid Params`, `-32603 Internal Error`) return `HTTP 200 OK` with JSON-RPC error payload. This prevents MCP client SDKs from aborting on transport-level 4xx codes and allows them to cleanly inspect the RPC error object.

## Dependencies & Execution Order
- **Mode**: Independent ⚡ (disjoint, parallelizable)
- **Depends On**: none
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- `apps/api/src/index.ts`
- `apps/api/test/e2e.test.ts`
- `scripts/live-test-suite.sh`

## References
- **Shared Understanding & Fact Sheet**: [`goals/mcp-protocol-strict-compliance/facts.md`](facts.md)
- **Execution Plan**: [`goals/mcp-protocol-strict-compliance/plan.md`](plan.md)

## Done Condition
1. `apps/api/src/index.ts` returns `HTTP 200` for `-32601` (unknown method) and `-32602` (missing tool name).
2. `POST /mcp` still returns `HTTP 400` for unparseable JSON and `HTTP 413` for bodies > 1MB.
3. All vitest suites (`aube test`) and live edge tests pass cleanly.
