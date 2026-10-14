# Contributing to Islamic Sources (@IslamicSources)

Thank you for your interest in contributing to **Islamic Sources (@IslamicSources)** — the edge-native Islamic Model Context Protocol (MCP) Federation Gateway (`mcp.waqf.dev`) by [WaqfTech](https://waqftech.org).

This repository is endowed as an open digital waqf. We welcome contributions, bug fixes, performance improvements, and new federated Islamic MCP server adapters that uphold the authenticity, accuracy, and neutrality of Islamic digital heritage.

---

## 🏛️ Invariants & Non-Negotiables

Before submitting code, please review these core architectural requirements:

1. **Package Manager**:
   - Strictly use **`aube`** for installing packages and executing scripts (`aube install`, `aube test`, `aube run dev`, `aube run typecheck`).
   - **Never use `npm` or raw `yarn`**.
2. **Stateless Edge Runtime**:
   - The gateway operates purely as a stateless Cloudflare Worker request handler using the modern **Streamable HTTP transport** (`POST /mcp` and `GET /mcp` with SSE).
   - **Zero Durable Objects** to avoid high lock latencies and memory lease costs.
3. **Neutral Aggregation & Verbatim Transmission**:
   - The gateway is strictly an aggregator. We **never** author, add to, edit, or alter responses from upstream Islamic sources. All texts (Quranic verses, Hadiths, Tafsir commentaries) are relayed verbatim.
   - The Waqf Digital Public License (Waqf-DPL) governs the gateway software only; each upstream provider retains its own license.
4. **Universal Caching & Non-Blocking Logging**:
   - Caching is stored in Cloudflare D1 SQLite (`mcp_cache`) with SHA-256 keys.
   - All D1 writes for telemetry logs and cache mutations MUST execute inside `ctx.waitUntil()`. Never block or delay client MCP responses.
5. **Multi-lingual Landing Page**:
   - Built with Astro 7+ with Arabic first (RTL default).
   - **Zero embedded strings**: All user-facing strings MUST live in `apps/web/src/lang/{lang}.json`.
6. **Communication Language**:
   - Code comments, commit messages, and PR discussions are conducted in **English**.

---

## 🚀 Development Setup

### Prerequisites
- Node.js (v20+ recommended)
- [`aube`](https://github.com/jdx/aube) package manager
- Cloudflare Wrangler CLI (installed via workspace devDependencies)

### Quickstart
```bash
# 1. Clone your fork
git clone https://github.com/<your-username>/waqf-mcp.git
cd waqf-mcp

# 2. Install workspace dependencies
aube install

# 3. Apply the D1 schema to the local database (edge caching + telemetry)
#    Without this the Worker starts fine but caches nothing and logs nothing.
aube run db:migrate:local

# 4. Run the automated Vitest test suite
aube test

# 5. Run TypeScript checks across all packages
aube run typecheck

# 6. Start local API and Astro Web dev servers concurrently
aube run dev
```

---

## 🔌 Adding a New Federated MCP Server

To federate a new authentic Islamic MCP server:

1. Capture its real surface first: `node scripts/probe-provider.mjs <mcp-url>` prints the initialize handshake, the exact tool schemas, and whether the server requires an MCP session. Tool lists must come from the live server, never from documentation.
2. Add the provider to `PROVIDER_CATALOG` in `packages/types/src/catalog.ts` (id, upstream URL, transport, and the tools verified in step 1). `apps/api/src/config/providers.config.ts` and the landing page cards derive from that catalog, so the provider list lives in exactly one place.
3. If the server provides foundational tools, map them to canonical tools in `apps/api/src/core/normalizer.ts` and route them in `apps/api/src/core/router.ts` (plus the relevant `?suite=` filter).
4. Add the localized card copy under `servers.cards.<id>` in all five `apps/web/src/lang/*.json` files. The types require every locale to carry the same keys.
5. Mirror the provider into `apps/web/public/llms.txt` and `apps/web/public/llms-full.txt`, then run `node scripts/generate-llms-constants.mjs` so the Worker serves the same text. `aube test` fails whenever catalog, config or llms artifacts disagree.
6. Add unit and E2E tests in `apps/api/test/`.
7. Run `aube test`, `aube run typecheck` and `aube run build` to verify your addition.

---

## 📋 Pull Request Guidelines

1. **Branch Naming**: Use descriptive prefixes: `feat/...`, `fix/...`, `docs/...`, `perf/...`.
2. **Quality Gates**: Ensure `aube test` and `aube run typecheck` pass with zero warnings or errors.
3. **Commit Messages**: Follow Conventional Commits (e.g. `feat(api): ...`, `fix(web): ...`).
4. **License Agreement**: By submitting a pull request, you agree that your contribution is licensed under the [Waqf Digital Public License (Waqf-DPL 1.0)](./LICENSE.md).
