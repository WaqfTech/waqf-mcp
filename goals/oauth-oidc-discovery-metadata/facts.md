# Facts: Publish OAuth/OIDC Discovery Metadata for Protected APIs

## Architectural Invariants & Constraints
- Conform to RFC 8414 OAuth 2.0 Authorization Server Metadata
- Declare public access vs admin telemetry scopes

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/oauth-authorization-server`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: No OAuth/OIDC discovery metadata found
- **Prescribed Fix**: If your site has protected APIs, publish /.well-known/openid-configuration (for OpenID Connect) or /.well-known/oauth-authorization-server (for pure OAuth 2.0) with your issuer, authorization_endpoint, token_endpoint, jwks_uri, and grant_types_supported. This allows AI agents to programmatically discover how to authenticate.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/oauth-discovery/SKILL.md](https://isitagentready.com/.well-known/agent-skills/oauth-discovery/SKILL.md)
- **Specification Documentation**:
  - [http://openid.net/specs/openid-connect-discovery-1_0.html](http://openid.net/specs/openid-connect-discovery-1_0.html)
  - [https://www.rfc-editor.org/rfc/rfc8414](https://www.rfc-editor.org/rfc/rfc8414)
