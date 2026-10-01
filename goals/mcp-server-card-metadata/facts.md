# Facts: Publish an MCP Server Card (SEP-1649) for Agent Discovery

## Architectural Invariants & Constraints
- Conform to MCP SEP-1649 specification
- Ensure HTTP 200 and application/json response at /.well-known/mcp/server-card.json

## File & Interface Contracts
- Relevant files:
  - `apps/web/public/.well-known/mcp/server-card.json`
  - `apps/api/src/index.ts`

## Agent Readiness Audit Finding
- **Issue**: /.well-known/mcp/server-card.json returned status 403
- **Prescribed Fix**: Serve an MCP Server Card (SEP-1649) at /.well-known/mcp/server-card.json with serverInfo (name, version), transport endpoint, and capabilities. The schema is being standardized at https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/mcp-server-card/SKILL.md](https://isitagentready.com/.well-known/agent-skills/mcp-server-card/SKILL.md)
- **Specification Documentation**:
  - [https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)
