# Facts: Publish Agent Skills Discovery Index (RFC v0.2.0)

## Architectural Invariants & Constraints
- Conform to Cloudflare Agent Skills Discovery RFC v0.2.0
- Provide accurate sha256 digests for each exposed skill

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/agent-skills/index.json`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: Agent Skills index not found
- **Prescribed Fix**: Publish a skills discovery index at /.well-known/agent-skills/index.json (per the Agent Skills Discovery RFC v0.2.0). Include a $schema field, and a skills array where each entry has name, type, description, url, and a sha256 digest.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/agent-skills/SKILL.md](https://isitagentready.com/.well-known/agent-skills/agent-skills/SKILL.md)
- **Specification Documentation**:
  - [https://github.com/cloudflare/agent-skills-discovery-rfc](https://github.com/cloudflare/agent-skills-discovery-rfc)
  - [https://agentskills.io/](https://agentskills.io/)
