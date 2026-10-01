# Facts: Publish an ARD (Agentic Resource Discovery) Capability Manifest

## Architectural Invariants & Constraints
- Conform strictly to Agentic Resource Discovery (ARD) specification
- Content-Type: application/json with Access-Control-Allow-Origin: *

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/ai-catalog.json`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: ARD capability manifest not found
- **Prescribed Fix**: Serve /.well-known/ai-catalog.json at the origin root with Content-Type: application/json and Access-Control-Allow-Origin: *. Include specVersion, a host object, and an entries array. Give each entry a urn:air:<your-domain>:<namespace>:<name> identifier, a displayName, an IANA media type in "type", and exactly one of url or data. Add 2-5 representativeQueries per entry so registries can build semantic embeddings.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/ard/SKILL.md](https://isitagentready.com/.well-known/agent-skills/ard/SKILL.md)
- **Specification Documentation**:
  - [https://agenticresourcediscovery.org/](https://agenticresourcediscovery.org/)
  - [https://github.com/ards-project/ard-spec](https://github.com/ards-project/ard-spec)
  - [https://github.com/Agent-Card/ai-catalog](https://github.com/Agent-Card/ai-catalog)
