# Fact Sheet: MCP Protocol HTTP Status Code Compliance

## Context & Finding
During live edge testing with MCP clients and `scripts/live-test-suite.sh`, we observed that returning `HTTP 404` for unrecognized RPC methods (`code: -32601`) or `HTTP 400` for missing tool arguments (`code: -32602`) triggers HTTP-level transport aborts in strict MCP client SDKs (such as Claude Web or Anthropic MCP SDK) before the client parses the JSON-RPC error payload.

## Core Invariants
1. **JSON-RPC Protocol Errors over HTTP**: In JSON-RPC 2.0 and MCP Streamable HTTP, once an HTTP POST request is recognized at a valid endpoint (`/mcp`) with valid JSON syntax, protocol-level errors (`-32601 Method not found`, `-32602 Invalid params`, `-32603 Internal error`) MUST return `HTTP 200` with the standard `{ jsonrpc: "2.0", id, error: { code, message } }` envelope.
2. **HTTP Transport Errors**:
   - `HTTP 404 Not Found`: Reserved only for non-existent URL routes (e.g. `GET /random-path`).
   - `HTTP 400 Bad Request`: Reserved only for unparseable raw JSON syntax errors (`code: -32700`).
   - `HTTP 413 Payload Too Large`: Reserved for request bodies exceeding 1MB.
   - `HTTP 405 Method Not Allowed`: When calling unsupported methods (e.g. `DELETE /mcp`).
