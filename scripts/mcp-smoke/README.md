# mcp-smoke

Full-surface, read-only smoke test for the public MCP gateway.

It initializes a session, lists every tool, calls all 55 advertised tools with
sample arguments, reads all resources, runs all prompts, and checks the public
transport paths:

- MCP 2026 `server/discover`, `tools/list`, and `tools/call` with per-request
  metadata, `resultType: complete`, and serverInfo
- Legacy `initialize` and `notifications/initialized`
- `GET /mcp` discovery JSON and finite SSE
- CORS preflight
- both protocol hosts, `.app` and `.dev`
- scanner paths and the unauthenticated admin endpoint

No credentials are used. No admin endpoint is called with a key. Tool arguments
come from live discovery: Aljam3 file/book IDs, Turath book/page/author IDs,
Shamela book/page IDs, a Bahouth topic ID, and Maher Al-Fahel's `ilal` book.

## Usage

```bash
go run ./scripts/mcp-smoke/main.go -delay 250ms -json /tmp/mcp-smoke.json
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `-base` | `https://mcp.waqf.app/mcp` | MCP endpoint |
| `-delay` | `200ms` | Pause between tool calls |
| `-timeout` | `45s` | Per-request timeout |
| `-json` | empty | Optional JSON report path |
| `-strict` | false | Fail on HTTP/protocol errors, missing tools or missing sample args |
| `-strict-tools` | false | Also fail on unexpected tool errors; the intentional `waqf_search` probe is ignored |
| `-expect-tools` | 55 | Expected advertised tool count; 0 disables |

The pre-deploy gate is `bash scripts/release-check.sh` or `aube run release:check`.
It runs unit/type checks and the strict smoke against both hosts.

The script classifies each attempt as `OK`, `TOOL_ERROR`, `PROTOCOL_ERROR`, or
`HTTP_ERROR`. A `TOOL_ERROR` is a valid MCP result with `isError: true`, not a
gateway failure. The intentional `waqf_search` probe should be the only tool
error when everything is healthy.

A run takes about 30 seconds at the default pacing. Use a longer `-delay` when
testing a rate-limited or fragile upstream.
