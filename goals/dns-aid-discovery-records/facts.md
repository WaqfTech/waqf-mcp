# Facts: Publish DNS for AI Discovery (DNS-AID) Records

## Architectural Invariants & Constraints
- Conform strictly to draft-mozleywilliams-dnsop-dnsaid and RFC 9460
- Document DNSSEC signing requirements for validating resolvers

## File & Interface Contracts
- Relevant files:
  - `docs/dns-aid.md`
  - `scripts/setup-dns-aid.sh`

## Agent Readiness Audit Finding
- **Issue**: DNS for AI Discovery (DNS-AID) well-known entrypoint records not found
- **Prescribed Fix**: Publish DNS for AI Discovery (DNS-AID) records under your domain, for example _index._agents.example.com or _a2a._agents.example.com, using ServiceMode SVCB/HTTPS records with alpn and endpoint parameters. Sign the public discovery zone with DNSSEC so validating resolvers return authenticated data.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md](https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md)
- **Specification Documentation**:
  - [https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/)
  - [https://www.rfc-editor.org/rfc/rfc9460](https://www.rfc-editor.org/rfc/rfc9460)
