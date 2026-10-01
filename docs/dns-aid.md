# DNS for AI Discovery (DNS-AID) Architecture & Record Configuration

This document specifies the **DNS for AI Discovery (DNS-AID)** configuration for `mcp.waqf.dev` conforming to [draft-mozleywilliams-dnsop-dnsaid](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/) and [RFC 9460 (SVCB and HTTPS RRs)](https://www.rfc-editor.org/rfc/rfc9460).

---

## 1. Overview & Purpose

DNS-AID allows AI agents, Autonomous Model Clients, and Web Crawlers to discover model context protocol servers and agent capabilities directly through the Domain Name System (DNS) before establishing TLS or HTTP connections.

By signing the parent zone (`waqf.dev`) with **DNSSEC**, validating resolvers can cryptographically authenticate service endpoints and prevent spoofing or unauthorized redirection of Islamic sacred texts.

---

## 2. Standard Entrypoints & Record Definitions

### 2.1. Discovery Index Entrypoint (\`_index._agents.mcp.waqf.dev\`)

Points agents to the root capability manifest (`ai-catalog.json` and `api-catalog`).

- **Record Name**: `_index._agents.mcp.waqf.dev`
- **Record Type**: `HTTPS` (ServiceMode)
- **Priority**: `1`
- **Target**: `mcp.waqf.dev.`
- **Parameters**: `alpn="h2,h3" port="443"`

#### DNS TXT Fallback Record:
\`\`\`dns
_index._agents.mcp.waqf.dev. 300 IN TXT "v=aid1; uri=https://mcp.waqf.dev/.well-known/ai-catalog.json; skills=https://mcp.waqf.dev/.well-known/agent-skills/index.json"
\`\`\`

---

### 2.2. MCP Federation Service Entrypoint (\`_mcp._agents.mcp.waqf.dev\`)

Advertises the Streamable HTTP Model Context Protocol gateway.

- **Record Name**: `_mcp._agents.mcp.waqf.dev`
- **Record Type**: `HTTPS` (ServiceMode)
- **Priority**: `1`
- **Target**: `mcp.waqf.dev.`
- **Parameters**: `alpn="h2,h3" port="443"`

#### DNS TXT Fallback Record:
\`\`\`dns
_mcp._agents.mcp.waqf.dev. 300 IN TXT "v=aid1; uri=https://mcp.waqf.dev/mcp; card=https://mcp.waqf.dev/.well-known/mcp/server-card.json; proto=streamable-http"
\`\`\`

---

## 3. Cryptographic Validation (DNSSEC)

In Cloudflare DNS dashboard or via API:
1. Navigate to DNS Settings for `waqf.dev`.
2. Enable **DNSSEC**.
3. Retrieve DS records and verify registry chain of trust at TLD (`.dev`).

All DNS-AID clients with validating resolvers (such as `1.1.1.1` or `8.8.8.8`) will receive the `AD` (Authenticated Data) flag.

---

## 4. Automated Provisioning

Run the companion deployment script:
\`\`\`bash
chmod +x scripts/setup-dns-aid.sh
./scripts/setup-dns-aid.sh
\`\`\`
