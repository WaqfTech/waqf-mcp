# Facts: Add User-Agent Rules for AI Crawlers in robots.txt

## Architectural Invariants & Constraints
- Distinguish search crawlers from training crawlers
- Conform to Cloudflare AI crawl control and RFC 9309

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/robots.txt`

## Agent Readiness Audit Finding
- **Issue**: No AI-specific bot rules and no wildcard rules in robots.txt
- **Prescribed Fix**: Add explicit User-agent entries for AI crawlers with allow/disallow rules that match your policy. Search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot) fetch the pages AI assistants use in their answers, so blocking them affects whether you appear in AI answers. Training crawlers (GPTBot, ClaudeBot, Google-Extended) collect model training data; blocking them does not affect whether your pages appear in AI search results.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md](https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md)
- **Specification Documentation**:
  - [https://www.rfc-editor.org/rfc/rfc9309](https://www.rfc-editor.org/rfc/rfc9309)
  - [https://developers.cloudflare.com/ai-crawl-control/](https://developers.cloudflare.com/ai-crawl-control/)
