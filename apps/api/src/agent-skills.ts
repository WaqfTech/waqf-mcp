export const AGENT_SKILLS_INDEX_JSON = JSON.stringify(
  {
    $schema: "https://agentskills.io/schemas/v0.2.0/index.json",
    skills: [
      {
        name: "quran-tafsir",
        type: "skill",
        description:
          "Retrieve Quranic verses in Arabic Uthmani script and verified classical/contemporary Tafsir.",
        url: "https://mcp.waqf.dev/.well-known/agent-skills/quran-tafsir/SKILL.md",
        sha256: "ca7cb05750c96b54ff38bd18642ea87399ec61732751335925dd05066c8e3b89",
      },
      {
        name: "hadith-heritage",
        type: "skill",
        description:
          "Query Sahih Hadith collections, verify authenticity gradings, and search classical Arabic literature across Shamela and Turath.",
        url: "https://mcp.waqf.dev/.well-known/agent-skills/hadith-heritage/SKILL.md",
        sha256: "26a31d1906b4e1f98cf1df4283b10d5cde52b36939bc6c4bbc277834c2783598",
      },
      {
        name: "scholarly-search",
        type: "skill",
        description:
          "Search verified Islamic research portals, university faculties, and fatwa archives across 38+ authenticated Islamic institutions.",
        url: "https://mcp.waqf.dev/.well-known/agent-skills/scholarly-search/SKILL.md",
        sha256: "74424834ff7b5cf468c31cf1d68cd34d40e286924d947413a373413f734527fb",
      },
    ],
  },
  null,
  2
);
