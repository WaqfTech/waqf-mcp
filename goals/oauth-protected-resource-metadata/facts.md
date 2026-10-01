# Facts: Publish OAuth Protected Resource Metadata (RFC 9728)

## Architectural Invariants & Constraints
- Conform to RFC 9728 OAuth 2.0 Protected Resource Metadata
- Declare resource identifier, authorization_servers, and scopes_supported

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/oauth-protected-resource`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: No OAuth Protected Resource Metadata found
- **Prescribed Fix**: Publish /.well-known/oauth-protected-resource with your resource identifier, authorization_servers (list of OAuth/OIDC issuer URLs that can issue tokens for this resource), and scopes_supported. This tells agents how to obtain access tokens for your protected APIs.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/oauth-protected-resource/SKILL.md](https://isitagentready.com/.well-known/agent-skills/oauth-protected-resource/SKILL.md)
- **Specification Documentation**:
  - [https://www.rfc-editor.org/rfc/rfc9728](https://www.rfc-editor.org/rfc/rfc9728)
