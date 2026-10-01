# Fact Sheet: Developer Quickstart & Client Integration Snippets

## Context & Finding
During live testing, we discovered that Cloudflare's Automated Bot Defense automatically blocks requests with Python's default User-Agent (`Python-urllib/3.x`) with `HTTP 403 Forbidden` before reaching the Worker.
When developers connect via custom scripts, Python notebooks, or agents, omitting a custom `User-Agent` header results in immediate failure.

## Objectives
1. Provide ready-to-use, tested code snippets for:
   - Python (`httpx` / `requests` / standard library with explicit `User-Agent`)
   - TypeScript (using `@modelcontextprotocol/sdk` and `fetch`)
   - cURL (command line)
   - Configuration JSON for popular MCP clients (Claude Desktop, Cursor, Gemini Connected Apps, ChatGPT Developer Mode).
2. Update the multi-lingual landing page (`apps/web/src/pages/index.astro` and locale dictionaries) to display these snippets with one-click copy buttons and clear warnings about `User-Agent` requirements.
