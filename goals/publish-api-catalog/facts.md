# Facts: Publish an API Catalog for Automated API Discovery (RFC 9727)

## Architectural Invariants & Constraints
- Content-Type: application/linkset+json
- Conform strictly to RFC 9727 and RFC 9264 linkset schema

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/api-catalog`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: API Catalog not found
- **Prescribed Fix**: Create /.well-known/api-catalog returning application/linkset+json with a "linkset" array. Each entry should include an "anchor" URL for the API and link relations for service-desc (OpenAPI spec), service-doc (documentation), and status (health endpoint). See RFC 9727 Appendix A for examples.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md](https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md)
- **Specification Documentation**:
  - [https://www.rfc-editor.org/rfc/rfc9727](https://www.rfc-editor.org/rfc/rfc9727)
  - [https://www.rfc-editor.org/rfc/rfc9264](https://www.rfc-editor.org/rfc/rfc9264)
