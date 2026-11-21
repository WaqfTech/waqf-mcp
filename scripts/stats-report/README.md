# stats-report

Local usage report for the MCP gateway. It reads production D1 through the
operator's existing `wrangler` login. No secret is read or printed.

## Layout

`main.go` is a thin entry point. The implementation and tests live in
`report/`; the repository `go.work` resolves the package when the command is
run from the repository root.

## Usage

```bash
# 30-day table report from the daily rollup
go run ./scripts/stats-report/main.go

# One dimension as Markdown
go run ./scripts/stats-report/main.go -dimension provider -format markdown

# Public-safe Arabic page, English page and JSON snapshot
go run ./scripts/stats-report/main.go -days 30 -public -min-calls 10 \
  -lang ar -format html -output analytics/index.html
go run ./scripts/stats-report/main.go -days 30 -public -min-calls 10 \
  -lang en -format html -output analytics/en/index.html
go run ./scripts/stats-report/main.go -days 30 -public -min-calls 10 \
  -format json -output analytics/stats.json

# Raw logs for an exact window, or while the rollup is empty
go run ./scripts/stats-report/main.go -since 2026-11-21T07:09:30Z -dimension country

# Local D1 instead of remote
go run ./scripts/stats-report/main.go -remote=false -days 7
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `-days` | 30 | Lookback window in days |
| `-since` | empty | RFC3339 start; overrides `-days` |
| `-source` | rollup | rollup reads `mcp_stats_daily`; raw reads `mcp_logs` |

A non-midnight `-since` automatically uses raw logs, because daily rollups
cannot answer a precise time. Pass `-source rollup` to force daily granularity.
| `-dimension` | all | provider, country, client, tool, method, status, trend, all |
| `-format` | table | table, markdown, csv, json, html |
| `-lang` | ar | html language: ar or en |
| `-output` | empty | Write html or json to a file |
| `-db` | waqf-app | D1 database name |
| `-remote` | true | Use remote D1; false uses local |
| `-public` | false | Drop method/status and suppress small cells |
| `-min-calls` | 10 | Threshold used by `-public` |

## Data sources

By default the script reads `mcp_stats_daily`, the worker's daily rollup. The
worker aggregates the previous UTC day at 00:15. Backfill or repair any day with:

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  "https://mcp.waqf.dev/api/stats/aggregate?days=30"
```

Use `?date=YYYY-MM-DD` for one day. With `-source raw`, the script reads
`mcp_logs` instead: timestamp, upstream provider, tool, method, country, client
app, status, error message, cache hit flag, latency, response bytes, and hashed
client IP. It never reads query text, user agents, or cache payloads.

## Shareable page

`-format html` writes a self-contained page with KPIs, daily trend, provider,
country, client and tool tables, and a topic donut. It uses the same public-safe
data as the JSON snapshot. Arabic is the default at `analytics/index.html`;
English is at `analytics/en/index.html`; the data is at `analytics/stats.json`.

## Lifecycle

Project-local reporting tool. Keep it with the repository; promote it to
`/mnt/Jad/github/go-tools` only when a second project needs the same report.
