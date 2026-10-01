# AGENTS.md — Waqf MCP Federation Gateway (`mcp.waqf.dev`)

Read the global agent rules at `~/.agents/AGENTS.md` first. They apply here too.
This repository also strictly follows `AGENTS.cloudflare.md` standards.

---

## 1. What this Project Is

`waqf-mcp` is an edge-native Islamic Model Context Protocol (MCP) Federation Gateway and multi-lingual platform connecting Muslim developers and AI assistants to Islamic sources through a single, unified interface (`mcp.waqf.dev`).

It federates independent Islamic MCP servers (e.g. `bahouth.tafsir.net`, `mcp.tafsir.net`, `mcp.turath.io`, `maheralfahel.net`), unifies divergent schemas, caches immutable texts in Cloudflare D1 SQLite, and logs rich request telemetry without slowing down client interactions.

---

## 2. Invariants & Non-Negotiables

1. **Package Manager**:
   - Strictly use **`aube`** for all package installations and running scripts (`aube add`, `aube install`, `aube run`, `aube test`).
   - **NEVER use `npm` or raw `yarn`**.
2. **Stateless Edge Runtime (Zero Durable Objects)**:
   - MCP server operates purely as a stateless Cloudflare Worker request handler using the modern **Streamable HTTP transport** (`createMcpHandler` from `@modelcontextprotocol/sdk`).
   - No Durable Objects. Avoid expensive leases and persistent memory locks.
3. **Database & Universal Caching (D1 SQLite + Drizzle ORM)**:
   - All database access (schemas, migrations, queries) lives in `packages/db` using **Drizzle ORM** (`drizzle-orm/d1`).
   - **Cache**: Cached Quran/Hadith/Tafsir lookups are stored in D1 (`mcp_cache`), NOT in KV. D1 provides indexed relational lookups, higher reading limits on paid plans, and zero cold-start variance.
   - **Logging**: Detailed telemetry (`mcp_logs`) capturing Geo, ASN, IP hash, latency, and tool arguments is written to D1.
4. **Non-Blocking Telemetry (`ctx.waitUntil`)**:
   - All D1 writes for audit logs and cache updates MUST execute inside `ctx.waitUntil()`. Never block or delay the client's MCP response.
5. **SOLID Architecture & Dependency Inversion**:
   - The gateway router interacts exclusively through the `IMcpProvider` interface.
   - Adding a new upstream MCP server is done by registering an adapter (`JsonRpcMcpAdapter` or `SseMcpAdapter`) in `providers.config.ts`, without modifying router internals.
6. **Multi-Lingual Landing Page (Astro 7+)**:
   - **Arabic first (RTL default)**, English, Turkish (`tr`), Indonesian (`id`), and Malaysian (`ms`).
   - **Zero embedded strings**: All user-facing strings MUST live in `lang/{lang}.json`.
   - **Design Tokens**: Borrowed directly from `dev.waqftech.org` and `hasan-ui` (`--ink: #112b38`, `--paper: #eef5f2`, `--tide: #2e7d76`, `--lime: #c6ee67`, `--clay: #e6a37a`, Tajawal typography).
7. **Runtime & Type Isolation**:
   - DOM APIs (`window`, `document`) must NEVER leak into `apps/api` (Worker types only).
   - Worker types must NEVER leak into `apps/web` (DOM library only).
8. **Communication Language**:
   - **Never respond in Arabic**. Always communicate, explain, and report findings strictly in **English**, even when discussing Arabic domain terms or handling multilingual content.

---

## 3. Monorepo Structure

```
waqf-mcp/
├── pnpm-workspace.yaml            # Monorepo workspace configuration (managed via aube)
├── package.json                   # Root orchestrator scripts
├── tsconfig.base.json             # Root TypeScript compiler options
├── goals/                         # Sila goal packages
├── apps/
│   ├── api/                       # Cloudflare Worker MCP Federation Gateway (mcp.waqf.dev)
│   └── web/                       # Astro 7+ multi-lingual landing page
└── packages/
    ├── db/                        # D1 SQLite schema (Drizzle ORM)
    └── types/                     # Shared TypeScript interfaces & DTOs
```

---

## 4. Commands (via `aube`)

```bash
aube install              # Install dependencies across all workspace packages
aube run dev              # Run local API worker and Astro site concurrently
aube run build            # Build all packages and applications
aube test                 # Run Vitest test suites
aube run typecheck        # Run TypeScript typechecks across the monorepo
```
