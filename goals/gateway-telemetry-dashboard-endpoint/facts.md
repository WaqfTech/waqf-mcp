# Fact Sheet: Gateway Telemetry Analytics Endpoint

## Context & Finding
Telemetry logs are currently written into the `mcp_logs` table in Cloudflare D1 via `ctx.waitUntil()` on every request.
However, querying performance, error rates, top tools, and cache hit ratios currently requires manual `wrangler d1 execute` CLI queries.
There is no authenticated programmatic endpoint for monitoring dashboards, status badges, or admin observability.

## Schema & Metrics
The `mcp_logs` table already captures:
- `timestamp`, `clientIpHash`, `country`, `city`, `asn`, `colo`
- `transportType`, `clientApp`, `method`, `toolName`, `upstreamProvider`
- `isCacheHit`, `statusCode`, `latencyMs`, `errorMessage`

Key aggregates needed:
1. Total calls and requests in last 24h / 7d.
2. Global cache hit ratio (`SUM(isCacheHit) / COUNT(*)`).
3. P50 / P95 latency by tool.
4. Error rates per upstream provider.
5. Geographic request breakdown by country/region.
