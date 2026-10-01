# Facts: Publish Sitemap and Reference from robots.txt

## Architectural Invariants & Constraints
- Valid sitemaps.org XML schema
- Referenced in robots.txt via Sitemap: directive

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/sitemap.xml`
  - `apps/web/public/robots.txt`

## Agent Readiness Audit Finding
- **Issue**: sitemap.xml not found
- **Prescribed Fix**: Generate /sitemap.xml listing canonical URLs, keep it updated on publish, and reference it from /robots.txt.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md](https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md)
- **Specification Documentation**:
  - [https://www.sitemaps.org/protocol.html](https://www.sitemaps.org/protocol.html)
