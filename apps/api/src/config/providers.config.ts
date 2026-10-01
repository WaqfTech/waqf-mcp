import type { ProviderConfig } from "@waqf/types";

export const UPSTREAM_PROVIDERS: ProviderConfig[] = [
  {
    id: "bahouth",
    name: "Bahouth Quran & Tafsir",
    baseUrl: "https://bahouth.tafsir.net/mcp",
    transport: "json-rpc",
    description: "Quranic text analysis, roots, morphology, and verse topics.",
    timeoutMs: 8000,
    enabled: true,
  },
  {
    id: "tafsir_net",
    name: "Tafsir.net Specialized Suite",
    baseUrl: "https://mcp.tafsir.net/mcp",
    transport: "sse",
    description: "Authentic Quran Tafsir sources, Qira'at variants, and Nuzool context.",
    timeoutMs: 8000,
    enabled: true,
  },
  {
    id: "turath",
    name: "Turath Islamic Heritage Library",
    baseUrl: "https://mcp.turath.io/mcp/",
    transport: "json-rpc",
    description: "Full-text search and pages across thousands of classical Islamic books.",
    timeoutMs: 8000,
    enabled: true,
  },
  {
    id: "maheralfahel",
    name: "Sheikh Maher Al-Fahel Scholarly Library",
    baseUrl: "https://maheralfahel.net/mcp/",
    transport: "sse",
    description: "Specialized Hadith critique, books, media, and scholarly publications.",
    timeoutMs: 8000,
    enabled: true,
  },
];
