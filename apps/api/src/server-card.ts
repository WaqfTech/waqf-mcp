export const MCP_SERVER_CARD_JSON = JSON.stringify(
  {
    $schema: "https://modelcontextprotocol.io/schemas/server-card/v1.json",
    serverInfo: {
      name: "IslamicSources",
      title: "Islamic Sources (@IslamicSources)",
      version: "1.0.0",
      description:
        "Edge-native Islamic knowledge aggregator for AI assistants (@IslamicSources). Relays responses from authentic Quran, Tafsir, Hadith, and Turath sources verbatim without modification or alteration. Provided 'as is'.",
      websiteUrl: "https://mcp.waqf.dev",
    },
    disclaimer: {
      role: "Aggregator",
      unaltered: true,
      warranty: "as-is",
      statement:
        "Islamic Sources is strictly an aggregator. We do not author, add, edit, or alter responses from upstream Islamic sources, and the service is provided as is without warranty.",
    },
    transport: {
      type: "streamable-http",
      endpoint: "https://mcp.waqf.dev/mcp",
      sseEndpoint: "https://mcp.waqf.dev/sse",
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
    },
    authentication: {
      type: "none",
      description: "Public read access for all core Islamic scholarship tools without API keys.",
    },
    links: {
      documentation: "https://mcp.waqf.dev/llms.txt",
      technicalCatalog: "https://mcp.waqf.dev/llms-full.txt",
      repository: "https://github.com/waqftech/waqf-mcp",
    },
  },
  null,
  2
);
