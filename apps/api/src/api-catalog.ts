export const API_CATALOG_JSON = JSON.stringify(
  {
    linkset: [
      {
        anchor: "https://mcp.waqf.app/mcp",
        "service-desc": [
          {
            href: "https://mcp.waqf.app/.well-known/mcp/server-card.json",
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: "https://mcp.waqf.app/llms-full.txt",
            type: "text/markdown",
          },
          {
            href: "https://mcp.waqf.dev/#setup",
            type: "text/html",
          },
        ],
        status: [
          {
            href: "https://mcp.waqf.app/health",
            type: "application/json",
          },
        ],
      },
      {
        anchor: "https://mcp.waqf.app/",
        "service-doc": [
          {
            href: "https://mcp.waqf.app/llms.txt",
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: "https://mcp.waqf.app/health",
            type: "application/json",
          },
        ],
      },
    ],
  },
  null,
  2
);
