# Facts: Publish Auth.md Metadata for Agent Registration

## Architectural Invariants & Constraints
- Conform to WorkOS Auth.md specification
- Provide clear instructions for both public unauthenticated access and admin API keys

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/auth.md`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: auth.md not found
- **Prescribed Fix**: Serve /auth.md at the site root with agent registration instructions, publish /.well-known/oauth-protected-resource, and include an agent_auth block in /.well-known/oauth-authorization-server with register_uri, supported identity types, credential types, and claim/revocation URLs where applicable.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/auth-md/SKILL.md](https://isitagentready.com/.well-known/agent-skills/auth-md/SKILL.md)
- **Specification Documentation**:
  - [https://workos.com/auth-md](https://workos.com/auth-md)
  - [https://github.com/workos/auth.md](https://github.com/workos/auth.md)
