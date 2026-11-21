# Usage analytics snapshot

Static, public-safe snapshot of gateway usage generated from `mcp_stats_daily`.

- `index.html`: self-contained dashboard, no external JavaScript or fonts
- `stats.json`: the same public-safe data as JSON

## Regenerate

```bash
go run ./scripts/stats-report/main.go -days 30 -public -min-calls 10 \
  -format html -output analytics/index.html
go run ./scripts/stats-report/main.go -days 30 -public -min-calls 10 \
  -format json -output analytics/stats.json
```

Requires the existing `wrangler` login. No secret is read or printed.

## Data notes

- Source: daily rollups in `mcp_stats_daily`.
- Cron: 00:15 UTC by `waqf-mcp-api`.
- Window: 30 days in this snapshot.
- Country and agent tables count tool calls only. Top-line calls and the daily
  trend include protocol traffic.
- Topic mix is derived from tool families, not raw query text.
- Public-safe: no raw queries, IP hashes, user agents, city or region. Cells
  below 10 calls are omitted.
