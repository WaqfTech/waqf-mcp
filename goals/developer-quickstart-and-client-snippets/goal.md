# Goal: Multilingual Developer Quickstart & Client Integration Snippets

## Goal Description
Expand landing page and documentation with tested client integration snippets in Python, TypeScript, and cURL, noting Cloudflare WAF bot mitigation requirements (`User-Agent` headers).

## Dependencies & Execution Order
- **Mode**: Dependent 🔗
- **Depends On**: multilingual-landing-page
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- `apps/web/src/pages/index.astro`
- `apps/web/src/lang/*.json`
- `README.md`

## References
- **Shared Understanding & Fact Sheet**: [`goals/developer-quickstart-and-client-snippets/facts.md`](facts.md)
- **Execution Plan**: [`goals/developer-quickstart-and-client-snippets/plan.md`](plan.md)

## Done Condition
1. Python snippet demonstrates valid connection with `User-Agent: my-app/1.0.0` or standard library header.
2. TypeScript snippet demonstrates connection using `@modelcontextprotocol/sdk`.
3. All 5 language dictionaries (`ar`, `en`, `tr`, `id`, `ms`) include localized section headers and explanations.
4. `aube run typecheck` and `aube run build` pass cleanly.
