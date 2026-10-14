export const AI_CATALOG_JSON = JSON.stringify(
  {
    specVersion: "1.0.0",
    host: {
      name: "mcp.waqf.app",
      url: "https://mcp.waqf.app",
    },
    entries: [
      {
        id: "urn:air:mcp.waqf.app:mcp:core",
        displayName: "Islamic Sources (@IslamicSources) — Core Tools",
        description:
          "Normalized high-level canonical tools for Quran recitation/tafsir, Hadith verification, Turath book searches, and scholarly inquiries.",
        type: "application/json",
        url: "https://mcp.waqf.app/mcp?suite=core",
        representativeQueries: [
          "Search Quran verse and tafsir",
          "Find Sahih hadith about intentions",
          "Search Shamela and Turath heritage books",
          "Query verified Islamic scholarship",
        ],
      },
      {
        id: "urn:air:mcp.waqf.app:mcp:quran",
        displayName: "Quran & Tafsir Gateway",
        description: "Specialized tools for Quran text retrieval, comparative Tafsir, and translation.",
        type: "application/json",
        url: "https://mcp.waqf.app/mcp?suite=quran",
        representativeQueries: [
          "Look up Surah Al-Ikhlas verse 1",
          "Tafsir Ibn Kathir for Ayah 255",
          "Search Holy Quran text in Arabic",
        ],
      },
      {
        id: "urn:air:mcp.waqf.app:mcp:turath",
        displayName: "Islamic Heritage & Hadith Library",
        description: "Classical Islamic library and Hadith verification tools powered by Turath and Bahouth.",
        type: "application/json",
        url: "https://mcp.waqf.app/mcp?suite=turath",
        representativeQueries: [
          "Search Sahih al-Bukhari hadith",
          "Browse Islamic jurisprudence fiqh treatises",
          "Query classical Arabic biographical dictionaries",
        ],
      },
      {
        id: "urn:air:mcp.waqf.app:mcp:search",
        displayName: "Fihris Islamic Scholarship Search",
        description: "Specialized web discovery across 38+ verified Islamic portals, seminaries, and fatwa archives.",
        type: "application/json",
        url: "https://mcp.waqf.app/mcp?suite=search",
        representativeQueries: [
          "Scholarly fatwa search on Zakat calculation",
          "Articles on Usul al-Fiqh methodology",
          "Search Islamic seminary portals",
        ],
      },
      {
        id: "urn:air:mcp.waqf.app:doc:llms",
        displayName: "Waqf MCP Agent Instruction Documentation",
        description: "Machine-readable documentation and setup instructions for AI coding assistants and LLMs.",
        type: "text/markdown",
        url: "https://mcp.waqf.app/llms.txt",
        representativeQueries: [
          "How to connect AI assistant to Islamic sources",
          "MCP configuration for Quran and Hadith",
        ],
      },
    ],
  },
  null,
  2
);
