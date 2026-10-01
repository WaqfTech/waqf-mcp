# Facts: Include Link Response Headers for Agent Discovery (RFC 8288)

## Architectural Invariants & Constraints
- Conform strictly to RFC 8288 and RFC 9727 Link header format
- Expose registered IANA link relations (api-catalog, service-doc, service-desc)

## File & Interface Contracts
- Relevant files:
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: No Link headers found on target page
- **Prescribed Fix**: Add Link response headers to your homepage that point agents to useful resources. For example: Link: </.well-known/api-catalog>; rel="api-catalog" to advertise your API catalog, or Link: </docs/api>; rel="service-doc" for API documentation. See RFC 8288 for the Link header format and IANA Link Relations for registered relation types.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md](https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md)
- **Specification Documentation**:
  - [https://www.rfc-editor.org/rfc/rfc8288](https://www.rfc-editor.org/rfc/rfc8288)
  - [https://www.rfc-editor.org/rfc/rfc9727#section-3](https://www.rfc-editor.org/rfc/rfc9727#section-3)
