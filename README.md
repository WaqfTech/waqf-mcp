# Waqf Islamic MCP Federation Gateway (`mcp.waqf.dev`)

> **أصولٌ رقمية لأثرٍ باقٍ** — An open, edge-native Model Context Protocol (MCP) gateway aggregating Islamic knowledge sources into a single, high-performance interface for AI assistants and developers.

[![License](https://img.shields.io/badge/license-Waqf--DPL-2e7d76.svg)](https://dev.waqftech.org/license)
[![Edge](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange.svg)](https://developers.cloudflare.com/workers/)
[![Database](https://img.shields.io/badge/storage-D1%20SQLite%20%2B%20Drizzle-blue.svg)](https://developers.cloudflare.com/d1/)
[![Package Manager](https://img.shields.io/badge/package%20manager-aube-c6ee67.svg)](https://github.com/jdx/aube)

---

## 🌟 Overview

Instead of forcing users to configure 10+ independent Islamic MCP servers in their AI IDEs (Claude Desktop, Cursor, Antigravity, VS Code), **Waqf MCP** serves as a federated gateway:

1. **Single Entrypoint**: Add `https://mcp.waqf.dev/mcp` once to access Quran, Hadith, Tafsir, and Islamic heritage books.
2. **Stateless Edge Architecture**: Zero Durable Objects; runs on Cloudflare Workers with modern Streamable HTTP.
3. **High-Speed Universal Cache (D1 SQLite)**: Caches immutable Islamic texts with SHA-256 keys, providing `< 5ms` repeat lookups.
4. **Collision Defense & Normalization**: Namespaces provider tools (`bahouth__get_verse`, `tafsir_net__fetch_ayah`, `turath__get_book`) and provides unified canonical tools (`waqf_quran_get_ayah`, `waqf_hadith_search`, `waqf_turath_search_books`).
5. **Context Window Protection**: Supports `?suite=core` to expose only curated canonical tools and prevent prompt token bloat.
6. **Multi-lingual Landing Page**: Built with Astro 7+, Arabic-first (RTL default), English, Turkish, Indonesian, and Malaysian, using `dev.waqftech.org` design tokens with zero embedded strings (`lang/{lang}.json`).

---

## 🔌 Currently Federated Islamic MCP Servers

| Upstream Server | Host | Transport | Focus & Key Tools |
| :--- | :--- | :---: | :--- |
| **Tafsir.net Specialized Suite** | `https://mcp.tafsir.net/mcp` | SSE (`text/event-stream`) | Authentic Tafsir sources, Qira'at variants, Nuzool, word morphology (`fetch_ayah`, `fetch_tafsir`) |
| **Bahouth Quran & Tafsir** | `https://bahouth.tafsir.net/mcp` | JSON-RPC 2.0 | Quranic root analysis, verse words, morphology, and verse topics (`get_verse`, `find_root`) |
| **Turath Islamic Heritage Library** | `https://mcp.turath.io/mcp/` | JSON-RPC 2.0 | Search across thousands of classical Islamic books, authors, and page texts (`discover_turath`, `search_turath`) |
| **Sheikh Maher Al-Fahel Library** | `https://maheralfahel.net/mcp/` | SSE (`text/event-stream`) | Hadith sciences, scholarly critique, and verified publications (`list-books`, `get-book`, `search-content`) |

---

## 🚀 Client Configuration (Quickstart)

Add the following configuration block to your AI tool of choice:

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "waqf-islamic-suite": {
      "url": "https://mcp.waqf.dev/mcp"
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "waqf-islamic-suite": {
      "url": "https://mcp.waqf.dev/mcp"
    }
  }
}
```

### Antigravity / Gemini CLI (`mcp_config.json`)
```json
{
  "mcpServers": {
    "waqf-islamic-suite": {
      "url": "https://mcp.waqf.dev/mcp"
    }
  }
}
```

### VS Code (Cline / Roo Code / Continue)
```json
{
  "mcpServers": {
    "waqf-islamic-suite": {
      "url": "https://mcp.waqf.dev/mcp"
    }
  }
}
```

### Query Profiles (Context Optimization)
* **`https://mcp.waqf.dev/mcp?suite=core`**: **(Recommended)** Exposes only unified canonical tools (`waqf_quran_get_ayah`, `waqf_hadith_search`, `waqf_turath_search_books`). Preserves context window!
* **`https://mcp.waqf.dev/mcp?suite=quran`**: Exposes only Quran and Tafsir tools.
* **`https://mcp.waqf.dev/mcp?suite=turath`**: Exposes only Hadith and classical heritage library tools.
* **`https://mcp.waqf.dev/mcp`**: Full federation suite (all canonical + all namespaced tools).

---

## 🏗️ Repository Architecture

Following `AGENTS.cloudflare.md` and `cf-monorepo-scaffold`:

```
waqf-mcp/
├── apps/
│   ├── api/                       # Cloudflare Worker MCP Gateway (mcp.waqf.dev)
│   │   ├── src/
│   │   │   ├── adapters/          # IMcpProvider, JsonRpcMcpAdapter, SseMcpAdapter
│   │   │   ├── canonical/         # High-level normalized Waqf tools
│   │   │   ├── core/              # ProviderRegistry, FederationRouter, SchemaNormalizer
│   │   │   ├── services/          # D1CacheService, D1TelemetryService
│   │   │   └── index.ts           # Stateless Streamable HTTP Worker entrypoint
│   │   └── wrangler.jsonc
│   │
│   └── web/                       # Multi-lingual Astro 7+ Landing Page
│       ├── src/
│       │   ├── components/        # HeroSection, ServersSection, ConfigSection, SubmitForm, FaqSection
│       │   ├── layouts/           # BaseLayout (Tajawal, WaqfTech design tokens)
│       │   ├── lang/              # ar.json, en.json, tr.json, id.json, ms.json
│       │   └── pages/             # index.astro (ar), [lang]/index.astro (en, tr, id, ms)
│       └── astro.config.mjs
│
├── packages/
│   ├── db/                        # Cloudflare D1 SQLite database (Drizzle ORM)
│   │   ├── src/schema.ts          # mcp_logs, mcp_cache, mcp_submissions
│   │   └── drizzle/               # Auto-generated SQL migrations
│   │
│   └── types/                     # Shared TypeScript interfaces & DTOs
│       └── src/index.ts
│
├── pnpm-workspace.yaml            # Monorepo workspace configuration
├── AGENTS.md                      # AI and developer invariants
└── package.json
```

---

## 🛠️ Developer Commands (Powered by `aube`)

> [!IMPORTANT]
> This repository strictly uses **`aube`** as the package manager. Never use `npm` or raw `yarn`.

```bash
# Install dependencies across all packages
aube install

# Run automated Vitest test suite
aube test

# Run TypeScript typechecks across the monorepo
aube run typecheck

# Start local Cloudflare Worker API & Astro Web concurrently
aube run dev

# Build production assets
aube run build
```

---

## 🛡️ License

Part of the **WaqfTech** digital waqf initiative. Open source under the [Waqf Digital Public License (Waqf-DPL 1.0)](https://github.com/WaqfTech/waqf-license-draft).
