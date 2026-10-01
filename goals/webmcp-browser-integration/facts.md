# Facts: Support WebMCP to Expose Site Tools via Browser DOM API

## Architectural Invariants & Constraints
- Conform to WebMCP API specification and Declarative API explainer
- Graceful progressive enhancement if document.modelContext is not supported

## File & Interface Contracts
- Relevant files:
  - `apps/web/src/layouts/BaseLayout.astro`
  - `apps/web/src/components/SubmitForm.astro`

## Agent Readiness Audit Finding
- **Issue**: No WebMCP tools detected on page load
- **Prescribed Fix**: Implement the WebMCP API by calling document.modelContext.registerTool() for each tool that exposes your site's key actions to AI agents. Each tool needs a name, description, inputSchema (JSON Schema), and an execute callback function; registerTool() returns a Promise. Pass an AbortSignal in the options to unregister tools when no longer needed. For existing HTML forms, add toolname and tooldescription attributes to the <form> and toolparamdescription to its inputs to expose them declaratively.
- **Official Agent Skill**: [https://isitagentready.com/.well-known/agent-skills/webmcp/SKILL.md](https://isitagentready.com/.well-known/agent-skills/webmcp/SKILL.md)
- **Specification Documentation**:
  - [https://webmachinelearning.github.io/webmcp/](https://webmachinelearning.github.io/webmcp/)
  - [https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md)
