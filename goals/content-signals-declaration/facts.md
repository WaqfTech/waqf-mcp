# Facts: Declare AI Content Usage Preferences with Content Signals in robots.txt

## Architectural Invariants & Constraints
- Conform to contentsignals.org specification
- Explicitly state ai-train, search, and ai-input policies

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/robots.txt`

## Agent Readiness Audit Finding
- **Issue**: No Content Signals found in robots.txt
- **Prescribed Fix**: Add Content-Signal directives to your robots.txt declaring preferences for ai-train, search, and ai-input. For example: Content-Signal: ai-train=no, search=yes, ai-input=no
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md](https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md)
- **Specification Documentation**:
  - [https://contentsignals.org/](https://contentsignals.org/)
  - [https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/](https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/)
