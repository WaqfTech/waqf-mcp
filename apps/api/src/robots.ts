export const ROBOTS_TXT = `# robots.txt for mcp.waqf.dev (RFC 9309)

# Default crawler rules
User-agent: *
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

# AI Search Crawlers (Real-time Assistant Citation & Search)
User-agent: OAI-SearchBot
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

User-agent: Claude-SearchBot
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

User-agent: PerplexityBot
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

# AI Model Training Crawlers
User-agent: GPTBot
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

User-agent: ClaudeBot
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry

User-agent: Google-Extended
Allow: /
Disallow: /api/stats
Disallow: /api/telemetry
`;
