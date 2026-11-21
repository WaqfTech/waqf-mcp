# Agent Authentication & Registration Guide (auth.md)

Welcome to the **Waqf Islamic Model Context Protocol (MCP) Federation Gateway** (`mcp.waqf.app`).

This guide outlines authentication policies, programmatic agent registration, credential management, and access tiers for autonomous AI agents, crawlers, and developer applications.

---

## 1. Authentication Philosophy: Open Waqf (Public Good)

All core Islamic research endpoints (`POST /mcp`, `GET /mcp`, `GET /llms.txt`, `GET /llms-full.txt`) are **freely accessible without API keys or accounts**. As an open digital waqf (وقف إسلامي تقني), our mission is to eliminate barriers preventing AI assistants and software developers from accessing authentic Islamic heritage.

| Tier | Endpoints | Authentication | Quota |
|------|-----------|----------------|-------|
| **Public Agent** | `POST /mcp`, `GET /mcp`, `GET /llms.txt` | **None required** | Edge controls may apply |
| **Telemetry & Stats** | `GET /api/stats`, `GET /api/telemetry`, `GET /api/cache/stats` | **Bearer `ADMIN_API_KEY`** | Protect the key; no app-level quota |
| **Admin** | `POST /api/stats/aggregate`, submission review | **Bearer `ADMIN_API_KEY`** / Cloudflare dashboard | Operator only |

The gateway does not implement per-IP rate limiting in application code. Use
Cloudflare WAF and rate-limiting rules when a hard quota is required.

---

## 2. Agent Identification (Best Practices)

While no token is required to query tools, agents should identify themselves with an informative `User-Agent` header:

```http
POST /mcp?suite=core HTTP/1.1
Host: mcp.waqf.app
User-Agent: MyIslamicResearchAgent/1.0 (contact: info@example.com)
Content-Type: application/json
```

---

## 3. Discovery Metadata Endpoints

AI agents can verify OAuth and Protected Resource declarations via IETF standard discovery paths:

- **OAuth 2.0 Authorization Server Metadata (RFC 8414)**:
  [`https://mcp.waqf.app/.well-known/oauth-authorization-server`](https://mcp.waqf.app/.well-known/oauth-authorization-server)
- **OAuth Protected Resource Metadata (RFC 9728)**:
  [`https://mcp.waqf.app/.well-known/oauth-protected-resource`](https://mcp.waqf.app/.well-known/oauth-protected-resource)
- **MCP Server Card (SEP-1649)**:
  [`https://mcp.waqf.app/.well-known/mcp/server-card.json`](https://mcp.waqf.app/.well-known/mcp/server-card.json)
- **Agent Skills Discovery Index (RFC v0.2.0)**:
  [`https://mcp.waqf.app/.well-known/agent-skills/index.json`](https://mcp.waqf.app/.well-known/agent-skills/index.json)

The gateway is public. OAuth discovery is provided for client compatibility;
tokens are optional client identifiers, not authorization. `/oauth/authorize`
redirects only to recognized client origins. Unknown redirect targets receive
a consent page and no code.

---

## 4. Protected Endpoints (Admin Telemetry)

To access gateway health analytics, cache inventory and D1 request logs:

```http
GET /api/stats?hours=24 HTTP/1.1
Host: mcp.waqf.app
Authorization: Bearer <ADMIN_API_KEY>
Accept: application/json
```

The same key gates `GET /api/cache/stats` and `POST /api/stats/aggregate`.
Rotate it if it is exposed. It is an application-level bearer secret, not a
replacement for Cloudflare Access or WAF policy.

For elevated quotas or institutional partnerships, contact [WaqfTech](https://waqftech.org/) via GitHub:
[`https://github.com/waqftech/waqf-mcp`](https://github.com/waqftech/waqf-mcp).
