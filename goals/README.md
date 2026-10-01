# Goals Status & Pragmatic Execution Roadmap

This index tracks all goal packages under `goals/`, their execution mode (Independent ⚡ vs Dependent 🔗), dependencies, and progress status.

## 🤖 Agent Guide: How to Create, Claim & Execute Goals

1. **Create a Goal**: Scaffold a new goal package conforming to standards:
   ```bash
   sila goals create <slug> --title="..." [--depends-on="..."] [--independent]
   ```
2. **Claim a Goal**: Lock the goal so no other agent duplicates work:
   ```bash
   sila goals claim <slug> --agent=<name> [--note="evaluating..."]
   ```
3. **Launch & Implement**: Follow `facts.md` and `plan.md` until all tests pass:
   ```bash
   /goal goals/<slug>/goal.md
   ```
4. **Progress Updates**: Report status updates during execution:
   ```bash
   sila goals report <slug> "Running e2e test suite"
   ```
5. **Commit with Goal Reference**: Include the goal path in your commit message:
   ```bash
   git commit -m "feat(scope): implement description (goals/<slug>/goal.md)"
   ```
6. **Auto-Reconciliation**: Run `sila goals` to scan commits, mark 🟢 **Implemented**, and clear the claim lock.

## Summary
- **Total Goals**: 27
- 🟢 **Implemented & Verified**: 12
- 🔵 **In Progress (Claimed)**: 1
- 🟡 **Ready to Execute (Pending)**: 0 (0 independent ⚡, 0 unblocked 🔗)
- ⛔ **Blocked on Prerequisites**: 14
- 🎯 **By Tier**: 26 immediate (Tier 1), 1 roadmap (Tier 2), 0 nice-to-have (Tier 3), 0 wont-fix (Tier 4)
- 📋 **Execution Tasks Progress**: 53/100 completed (53%)

---

## 🔵 In Progress (Claimed Goals)

| Goal Package | Tier | Mode | Agent | Status & Note | Started |
| :--- | :---: | :---: | :--- | :--- | :--- |
| [`publish-robots-txt-crawl-rules`](publish-robots-txt-crawl-rules/goal.md) | `🎯 Immediate` | `⚡ Indep` | `@antigravity` | in progress | 0s ago |

---

## 🟡 Ready to Execute (Pending Goals)

| Goal Package | Tier | Mode & Sequence | Dependencies | Focus & Description | Launch Command |
| :--- | :---: | :---: | :--- | :--- | :--- |
| [`ai-crawler-robots-rules`](ai-crawler-robots-rules/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: publish-robots-txt-crawl-rules | Add User-Agent Rules for AI Crawlers in robots.txt — Add explicit User-agent entries for AI crawlers (OAI-SearchBot, Claude-SearchBot... | `/goal goals/ai-crawler-robots-rules/goal.md` |
| [`content-signals-declaration`](content-signals-declaration/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: ai-crawler-robots-rules | Declare AI Content Usage Preferences with Content Signals in robots.txt — Add Content-Signal directives to robots.txt declaring preferences for ai-train, ... | `/goal goals/content-signals-declaration/goal.md` |
| [`publish-sitemap-xml`](publish-sitemap-xml/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: content-signals-declaration | Publish Sitemap and Reference from robots.txt — Generate /sitemap.xml listing canonical URLs, keep it updated on publish, and re... | `/goal goals/publish-sitemap-xml/goal.md` |
| [`agent-discovery-link-headers`](agent-discovery-link-headers/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: publish-sitemap-xml | Include Link Response Headers for Agent Discovery (RFC 8288) — Add Link response headers (RFC 8288) to homepage and API responses pointing agen... | `/goal goals/agent-discovery-link-headers/goal.md` |
| [`markdown-negotiation-for-agents`](markdown-negotiation-for-agents/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: agent-discovery-link-headers | Return HTML Responses as Markdown for Agent Content Negotiation — Return HTML responses as markdown when agents request it with Accept: text/markd... | `/goal goals/markdown-negotiation-for-agents/goal.md` |
| [`publish-api-catalog`](publish-api-catalog/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: markdown-negotiation-for-agents | Publish an API Catalog for Automated API Discovery (RFC 9727) — Create /.well-known/api-catalog returning application/linkset+json with link rel... | `/goal goals/publish-api-catalog/goal.md` |
| [`mcp-server-card-metadata`](mcp-server-card-metadata/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: publish-api-catalog | Publish an MCP Server Card (SEP-1649) for Agent Discovery — Serve an MCP Server Card (SEP-1649) at /.well-known/mcp/server-card.json with se... | `/goal goals/mcp-server-card-metadata/goal.md` |
| [`agentic-resource-discovery-manifest`](agentic-resource-discovery-manifest/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: mcp-server-card-metadata | Publish an ARD (Agentic Resource Discovery) Capability Manifest — Serve /.well-known/ai-catalog.json at origin root with ARD manifest format (urn:... | `/goal goals/agentic-resource-discovery-manifest/goal.md` |
| [`agent-skills-discovery-index`](agent-skills-discovery-index/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: agentic-resource-discovery-manifest | Publish Agent Skills Discovery Index (RFC v0.2.0) — Publish a skills discovery index at /.well-known/agent-skills/index.json per Clo... | `/goal goals/agent-skills-discovery-index/goal.md` |
| [`oauth-oidc-discovery-metadata`](oauth-oidc-discovery-metadata/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: agent-skills-discovery-index | Publish OAuth/OIDC Discovery Metadata for Protected APIs — Publish OAuth 2.0 / OIDC discovery metadata at /.well-known/oauth-authorization-... | `/goal goals/oauth-oidc-discovery-metadata/goal.md` |
| [`oauth-protected-resource-metadata`](oauth-protected-resource-metadata/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: oauth-oidc-discovery-metadata | Publish OAuth Protected Resource Metadata (RFC 9728) — Publish OAuth Protected Resource Metadata (RFC 9728) at /.well-known/oauth-prote... | `/goal goals/oauth-protected-resource-metadata/goal.md` |
| [`auth-md-agent-registration`](auth-md-agent-registration/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: oauth-protected-resource-metadata | Publish Auth.md Metadata for Agent Registration — Publish /auth.md at site root with autonomous agent registration instructions, A... | `/goal goals/auth-md-agent-registration/goal.md` |
| [`webmcp-browser-integration`](webmcp-browser-integration/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: auth-md-agent-registration | Support WebMCP to Expose Site Tools via Browser DOM API — Support WebMCP to expose site tools to AI agents via browser DOM API (document.m... | `/goal goals/webmcp-browser-integration/goal.md` |
| [`dns-aid-discovery-records`](dns-aid-discovery-records/goal.md) | `🎯 Immediate` | `🚢 SHIP ⛔ Blocked` | Prereqs: webmcp-browser-integration | Publish DNS for AI Discovery (DNS-AID) Records — Publish DNS for AI Discovery (DNS-AID) records under mcp.waqf.dev (_index._agent... | `/goal goals/dns-aid-discovery-records/goal.md` |

---

## 🟢 Implemented & Verified

| Goal Package | Mode | Shape | Task / Ref | Commit |
| :--- | :---: | :--- | :--- | :--- |
| [`monorepo-scaffold`](monorepo-scaffold/goal.md) | `⚡ Indep` | 🚢 SHIP | Git Commit | `eda6b93` |
| [`mcp-protocol-strict-compliance`](mcp-protocol-strict-compliance/goal.md) | `⚡ Indep` | 🚢 SHIP | Git Commit | `c8e189d` |
| [`service-binding-gateway-unification`](service-binding-gateway-unification/goal.md) | `⚡ Indep` | 🚢 SHIP | Git Commit | `90f9d83` |
| [`d1-database-schema`](d1-database-schema/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `397a013` |
| [`multilingual-landing-page`](multilingual-landing-page/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `59179e0` |
| [`core-mcp-federation-engine`](core-mcp-federation-engine/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `97e86ef` |
| [`developer-quickstart-and-client-snippets`](developer-quickstart-and-client-snippets/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `9aac2cf` |
| [`canonical-schemas-and-caching`](canonical-schemas-and-caching/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `13bd241` |
| [`telemetry-and-logging`](telemetry-and-logging/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `e4ec105` |
| [`e2e-testing-and-deployment`](e2e-testing-and-deployment/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `7bfb1ca` |
| [`canonical-adapters-and-fallbacks`](canonical-adapters-and-fallbacks/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `5335575` |
| [`gateway-telemetry-dashboard-endpoint`](gateway-telemetry-dashboard-endpoint/goal.md) | `🔗 Dep` | 🚢 SHIP | Git Commit | `cf7f6a1` |

