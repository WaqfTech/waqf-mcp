#!/usr/bin/env bash
# Pre-deploy gate: unit/type checks plus full-surface MCP smoke on both hosts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== unit tests =="
aube test

echo "== typechecks =="
aube run typecheck

echo "== report tests =="
go test waqf-mcp/stats-report/...

echo "== full-surface smoke: protocol host =="
go run ./scripts/mcp-smoke/main.go \
  -base https://mcp.waqf.app/mcp \
  -strict -expect-tools 57 -delay 250ms \
  -json /tmp/waqf-mcp-smoke-app.json

echo "== full-surface smoke: human host =="
go run ./scripts/mcp-smoke/main.go \
  -base https://mcp.waqf.dev/mcp \
  -strict -expect-tools 57 -delay 250ms \
  -json /tmp/waqf-mcp-smoke-dev.json

echo "== official inspector CLI strict check =="
npx @modelcontextprotocol/inspector --cli https://mcp.waqf.app/mcp --transport http --method tools/list --strict >/dev/null
npx @modelcontextprotocol/inspector --cli https://mcp.waqf.dev/mcp --transport http --method tools/list --strict >/dev/null

echo "release check passed"
