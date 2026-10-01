# Facts: Return HTML Responses as Markdown for Agent Content Negotiation

## Architectural Invariants & Constraints
- Content-Type: text/markdown; charset=utf-8 when Accept: text/markdown is present
- Return x-markdown-tokens header when available
- HTML remains default for browser user-agents

## File & Interface Contracts
- Relevant files:
  - `apps/api/src/index.ts`
  - `apps/api/test/e2e.test.ts`

## Agent Readiness Audit Finding
- **Issue**: Site does not support Markdown for Agents
- **Prescribed Fix**: Enable Markdown for Agents so requests with Accept: text/markdown return a markdown version of your HTML response while HTML stays the default for browsers. Confirm the response uses Content-Type: text/markdown (and x-markdown-tokens if available).
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md](https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md)
- **Specification Documentation**:
  - [https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
