/**
 * Single source of truth for the identity and protocol versions this gateway
 * advertises. `initialize` and `server/discover` must not drift apart: clients
 * cache either response and use it to choose how to talk to the server.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05"] as const;

export const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
} as const;

export const SERVER_INFO = {
  name: "IslamicSources",
  title: "WaqfTech-MCP",
  version: "1.0.0",
  websiteUrl: "https://waqftech.org",
} as const;

const SERVER_INSTRUCTIONS =
  "Islamic sources gateway for Quran, hadith, tafsir, books and scholarly search. " +
  "Prefer the canonical waqf_* tools; namespaced <provider>__<tool> tools expose upstream servers directly.";

/** MCP 2024-11-05 lifecycle result used by the legacy initialize handshake. */
export function buildInitializeResult() {
  return {
    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
}

/** MCP 2026-07-28 discovery result for clients that probe before initialize. */
export function buildDiscoverResult() {
  return {
    resultType: "complete",
    supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: SERVER_CAPABILITIES,
    _meta: {
      "io.modelcontextprotocol/serverInfo": SERVER_INFO,
    },
    instructions: SERVER_INSTRUCTIONS,
    ttlMs: 3600000,
    cacheScope: "public",
  };
}
