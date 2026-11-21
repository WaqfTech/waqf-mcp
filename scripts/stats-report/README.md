# stats-report

Local usage report for the MCP gateway. It reads production D1 through the
operator's existing `wrangler` login. No secret is read or printed.

## Usage

```bash
# 30-day table report across every dimension
go run ./scripts/stats-report

# One dimension as Markdown
go run ./scripts/stats-report -dimension provider -format markdown

# Public-safe JSON for a future website
go run ./scripts/stats-report -public -min-calls 10 -format json

# Local D1 instead of remote
go run ./scripts/stats-report -remote=false -days 7

# Exact window, for example since the last deploy
go run ./scripts/stats-report -since 2026-11-21T07:09:30Z -dimension provider
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `-days` | 30 | Lookback window in days |
| `-since` | empty | RFC3339 start; overrides `-days` |
| `-dimension` | all | provider, country, client, tool, method, status, trend, all |
| `-format` | table | table, markdown, csv, json |
| `-db` | waqf-app | D1 database name |
| `-remote` | true | Use remote D1; false uses local |
| `-public` | false | Drop method/status and suppress small cells |
| `-min-calls` | 10 | Threshold used by `-public` |

## Data sources

The script reads `mcp_logs`: timestamp, upstream provider, tool, method, country,
client app, status, error message, cache hit flag, latency, response bytes, and
hashed client IP. It does not read query text, user agents, or cache payloads.

## Lifecycle

Project-local reporting tool. Keep it with the repository; promote it to
`/mnt/Jad/github/go-tools` only when a second project needs the same report.
