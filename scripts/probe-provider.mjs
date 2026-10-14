#!/usr/bin/env node
/**
 * Probe a remote MCP server over Streamable HTTP and report its real surface.
 *
 * Usage:
 *   node scripts/probe-provider.mjs <mcp-url> [--names-only] [--call '<name>={"arg":1}']
 *
 * Reports the initialize handshake (session requirements, protocol version echo,
 * response framing), then tools/resources/prompts, whether a session header is
 * actually required, and optional sample tool calls.
 */

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "WaqfMCP-Probe", version: "1.0.0" };

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const namesOnly = args.includes("--names-only");
const callIndex = args.indexOf("--call");
const rawCall = callIndex === -1 ? null : args[callIndex + 1];

if (!url) {
  console.error("Usage: node scripts/probe-provider.mjs <mcp-url> [--names-only] [--call '<name>={json}']");
  process.exit(2);
}

function extractJsonPayload(rawText, contentType) {
  const trimmed = (rawText ?? "").trim();
  if (!trimmed) {
    throw new Error("Empty response body");
  }

  if (contentType && contentType.includes("text/event-stream")) {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (dataLines.length > 0) {
      return JSON.parse(dataLines[dataLines.length - 1]);
    }
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (dataLines.length > 0) {
    return JSON.parse(dataLines[dataLines.length - 1]);
  }

  throw new Error(`Unable to extract JSON payload from response: ${trimmed.slice(0, 200)}`);
}

async function post({ sessionId, protocolVersion, body, label }) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const rawText = await res.text();
  const elapsed = Date.now() - started;

  const contentType = res.headers.get("content-type");
  const sessionIdOut = res.headers.get("mcp-session-id");

  if (!namesOnly && label) {
    console.log(`\n--- ${label} ---`);
    console.log(`HTTP ${res.status} in ${elapsed}ms | content-type: ${contentType}${sessionIdOut ? ` | mcp-session-id: ${sessionIdOut}` : ""}`);
  }

  let parsed = null;
  let parseError = null;
  if (rawText.trim()) {
    try {
      parsed = extractJsonPayload(rawText, contentType);
    } catch (err) {
      parseError = err.message;
    }
  }

  if (!namesOnly && label && rawText.trim()) {
    const preview = JSON.stringify(parsed ?? rawText, null, 2);
    console.log(preview.length > 6000 ? `${preview.slice(0, 6000)}\n…[truncated, ${rawText.length} bytes total]` : preview);
  }
  if (!namesOnly && parseError) {
    console.log(`!! payload parse failed: ${parseError}`);
  }

  return { status: res.status, sessionId: sessionIdOut, contentType, parsed, rawText, parseError };
}

async function main() {
  console.log(`Probing MCP server: ${url}`);
  const findings = {};

  const init = await post({
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: DEFAULT_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    },
    label: "initialize",
  });

  if (init.status !== 200) {
    console.log(`\ninitialize failed with HTTP ${init.status} — aborting.`);
    process.exit(1);
  }

  const negotiated = init.parsed?.result?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  const sessionId = init.sessionId ?? undefined;
  findings.sessionIdReturned = Boolean(sessionId);
  findings.negotiatedProtocolVersion = negotiated;
  findings.sseFramed = Boolean(init.contentType && init.contentType.includes("text/event-stream"));
  findings.serverInfo = init.parsed?.result?.serverInfo ?? null;
  findings.capabilities = init.parsed?.result?.capabilities ?? null;

  if (sessionId) {
    const ack = await post({
      sessionId,
      protocolVersion: negotiated,
      body: { jsonrpc: "2.0", method: "notifications/initialized" },
      label: "notifications/initialized",
    });
    findings.initializedAckStatus = ack.status;
  }

  const tools = await post({
    sessionId,
    protocolVersion: negotiated,
    body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    label: "tools/list (with session)",
  });

  const toolList = tools.parsed?.result?.tools ?? [];
  findings.toolCount = toolList.length;
  findings.toolNames = toolList.map((t) => t.name);

  if (namesOnly) {
    console.log(`\n=== ${url} — ${toolList.length} tools ===`);
    for (const tool of toolList) {
      console.log(`  ${tool.name}`);
    }
  } else if (toolList.length > 0) {
    console.log("\n=== TOOL SCHEMAS ===");
    for (const tool of toolList) {
      console.log(`\n## ${tool.name}`);
      if (tool.title) console.log(`title: ${tool.title}`);
      if (tool.description) console.log(`description: ${tool.description}`);
      if (tool.inputSchema) console.log(`inputSchema: ${JSON.stringify(tool.inputSchema)}`);
      if (tool.annotations) console.log(`annotations: ${JSON.stringify(tool.annotations)}`);
    }
  }

  if (tools.parsed?.error) {
    findings.toolsListError = tools.parsed.error;
  }

  if (sessionId) {
    const stateless = await post({
      protocolVersion: negotiated,
      body: { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
      label: "tools/list (WITHOUT session header)",
    });
    findings.worksWithoutSession = !stateless.parsed?.error && stateless.status === 200;
    if (!namesOnly && stateless.rawText) {
      console.log(`stateless tools/list -> HTTP ${stateless.status}`);
    }
  }

  if (!namesOnly || true) {
    const resources = await post({
      sessionId,
      protocolVersion: negotiated,
      body: { jsonrpc: "2.0", id: 4, method: "resources/list", params: {} },
      label: "resources/list",
    });
    findings.resourceCount = resources.parsed?.result?.resources?.length ?? 0;
    findings.resourcesSupported = !resources.parsed?.error;

    const prompts = await post({
      sessionId,
      protocolVersion: negotiated,
      body: { jsonrpc: "2.0", id: 5, method: "prompts/list", params: {} },
      label: "prompts/list",
    });
    findings.promptCount = prompts.parsed?.result?.prompts?.length ?? 0;
    findings.promptsSupported = !prompts.parsed?.error;
  }

  if (rawCall) {
    const eq = rawCall.indexOf("=");
    const name = eq === -1 ? rawCall : rawCall.slice(0, eq);
    const callArgs = eq === -1 ? {} : JSON.parse(rawCall.slice(eq + 1));
    await post({
      sessionId,
      protocolVersion: negotiated,
      body: { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name, arguments: callArgs } },
      label: `tools/call ${name}`,
    });
  }

  console.log("\n=== FINDINGS ===");
  console.log(JSON.stringify(findings, null, 2));
}

main().catch((err) => {
  console.error(`Probe failed: ${err.message}`);
  process.exit(1);
});
