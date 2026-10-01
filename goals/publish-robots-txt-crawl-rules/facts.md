# Facts: Publish /robots.txt with Clear Crawl Rules

## Architectural Invariants & Constraints
- Return HTTP 200 with text/plain
- Conform strictly to RFC 9309

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/robots.txt`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: robots.txt exists but appears invalid (no User-agent directive)
- **Prescribed Fix**: Create /robots.txt at the site root with explicit User-agent directives and allow/disallow rules for key paths. Ensure it is plain text and returns 200.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md](https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md)
- **Specification Documentation**:
  - [https://www.rfc-editor.org/rfc/rfc9309](https://www.rfc-editor.org/rfc/rfc9309)
