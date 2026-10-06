import type {
  CanonicalQuranAyahInput,
  ToolDefinition,
  ToolResult,
} from "@waqf/types";

export class SchemaNormalizer {
  // Returns definitions for high-level Waqf Canonical tools
  public getCanonicalToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: "waqf_quran_get_ayah",
        description:
          "Lookup a verified Holy Quran Ayah by Surah and Ayah number, returning Uthmani text, English translation, and optional Tafsir explanations.",
        inputSchema: {
          type: "object",
          properties: {
            surah: {
              type: "integer",
              minimum: 1,
              maximum: 114,
              description: "Surah number (1 to 114)",
            },
            ayah: {
              type: "integer",
              minimum: 1,
              description: "Ayah number within the Surah",
            },
            includeTafsir: {
              type: "boolean",
              default: false,
              description: "Whether to include concise Tafsir explanation",
            },
            tafsirSource: {
              type: "string",
              description: "Specific tafsir source slug (e.g. 'mukhtasar', 'ibnkathir', 'tabari', 'saadi', 'muyassar', 'qurtubi')",
            },
            includeSciences: {
              type: "array",
              items: {
                type: "string",
                enum: ["tajweed", "irab", "gharib", "qiraat_ayah", "tadabbur"],
              },
              description: "Optional Quranic science annotations to include",
            },
          },
          required: ["surah", "ayah"],
        },
      },
      {
        name: "waqf_hadith_search",
        description:
          "Search classical Hadith and scholarly Islamic literature using full-text search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search keywords in Arabic or transliteration",
            },
            limit: {
              type: "integer",
              default: 5,
              description: "Maximum number of results to return",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "waqf_turath_search_books",
        description:
          "Search the vast Turath Islamic library catalog for classical books, authors, and encyclopedias.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Book title or author name in Arabic",
            },
            kind: {
              type: "string",
              enum: ["books", "authors", "categories", "all"],
              default: "books",
              description: "Metadata kind to search",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "waqf_search_scholarship",
        description:
          "Search across 38+ authentic Islamic scholarship portals (fatwas, research, classical treatises) using Fihris Islamic Search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search keywords or question in Arabic or English (e.g. 'شروط الصلاة', 'صيام يوم عاشوراء')",
            },
            fileType: {
              type: "string",
              enum: ["pdf", "doc", "docx", "txt"],
              description: "Optional file type filter",
            },
            dateRestrict: {
              type: "string",
              enum: ["d1", "w1", "m1", "y1"],
              description: "Optional date restriction (d1 = past 24h, w1 = past week, m1 = past month, y1 = past year)",
            },
            page: {
              type: "number",
              description: "Page number for pagination (default: 1)",
            },
          },
          required: ["query"],
        },
      },
    ];
  }

  // Translates canonical Quran input to Bahouth format
  public toBahouthVerseKey(input: CanonicalQuranAyahInput): string {
    return `${input.surah}-${input.ayah}`;
  }

  // Translates canonical Quran input to Tafsir.net format
  public toTafsirNetAyahArgs(input: CanonicalQuranAyahInput): Record<string, unknown> {
    const includeSet = new Set<string>();
    if (input.includeTafsir) {
      includeSet.add("tadabbur");
      includeSet.add("gharib");
    }
    if (input.includeTajweed) {
      includeSet.add("tajweed");
    }
    if (Array.isArray(input.includeSciences)) {
      for (const s of input.includeSciences) {
        includeSet.add(s);
      }
    }

    const args: Record<string, unknown> = {
      surah: input.surah,
      ayah: input.ayah,
    };

    if (includeSet.size > 0) {
      args.include = Array.from(includeSet);
    }

    if (input.tafsirSource) {
      args.tafsir_source = input.tafsirSource;
    }

    return args;
  }

  // Normalizes diverse upstream output blocks into a unified Waqf text envelope
  public normalizeToolResult(raw: ToolResult, sourceTag: string): ToolResult {
    return {
      isError: raw.isError,
      content: raw.content.map((block) => {
        if (block.type === "text") {
          return {
            type: "text",
            text: `[Source: ${sourceTag}]\n${block.text}`,
          };
        }
        return block;
      }),
    };
  }

  // Sanitizes provider-specific arguments to prevent schema mismatches
  public sanitizeProviderArgs(
    providerId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    if (providerId === "bahouth") {
      const sanitized = { ...args };
      // Normalize verse_key if provided with colon (e.g. "112:1" -> "112-1")
      if (typeof sanitized.verse_key === "string" && sanitized.verse_key.includes(":")) {
        sanitized.verse_key = sanitized.verse_key.replace(":", "-");
      }
      // If numerical surah/ayah properties are passed instead of verse_key, synthesize verse_key
      const surah = sanitized.surah ?? sanitized.surah_number;
      const ayah = sanitized.ayah ?? sanitized.verse_number ?? sanitized.ayah_number;
      if (!sanitized.verse_key && surah !== undefined && ayah !== undefined) {
        sanitized.verse_key = `${surah}-${ayah}`;
      }
      return sanitized;
    }

    return args;
  }
}
