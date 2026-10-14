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
      {
        name: "waqf_books_search",
        description:
          "Search inside the full text of classical Islamic books and return short matching passages with their source metadata (book, author, file and page) and a direct link to Aljam3. Excerpts are discovery aids, not complete evidence: read the page with waqf_books_read_page before quoting or interpreting, and cite the returned source URL.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              maxLength: 500,
              description: "Search terms, usually in Arabic; a quoted phrase searches for that exact phrase",
            },
            page: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 1,
              description: "Result page to return (not a book page number)",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 10,
              description: "Number of passages per result page",
            },
            bookId: {
              type: "integer",
              description: "Restrict to one book (discover IDs with aljam3__list_books or aljam3__get_book)",
            },
            authorId: {
              type: "integer",
              description: "Restrict to one author (discover IDs with aljam3__list_authors)",
            },
            categoryId: {
              type: "integer",
              description: "Restrict to one subject (discover IDs with aljam3__list_categories)",
            },
            libraryId: {
              type: "integer",
              description: "Restrict to one source collection (discover IDs with aljam3__list_libraries)",
            },
            locale: {
              type: "string",
              enum: ["ar", "ur", "en"],
              default: "ar",
              description: "Language of the returned links; does not translate the source text",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "waqf_books_read_page",
        description:
          "Read one exact page of a digitized book in context, with full citation metadata, a PDF link and the neighbouring page numbers. Long pages are chunked: repeat with the returned next offset to continue. Page numbers refer to the digitized file, not necessarily the printed edition, and the extracted text may contain OCR errors, so verify important quotations against the PDF.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "integer",
              description: "Book file ID, from waqf_books_search or aljam3__get_book",
            },
            pageNumber: {
              type: "integer",
              minimum: 1,
              description: "Page number within that file, from waqf_books_search",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Character offset to continue reading from (use the next offset returned by the previous call)",
            },
            maxChars: {
              type: "integer",
              minimum: 1,
              maximum: 12000,
              default: 6000,
              description: "Maximum characters of page text to return",
            },
            locale: {
              type: "string",
              enum: ["ar", "ur", "en"],
              default: "ar",
              description: "Language of the returned links; does not translate the source text",
            },
          },
          required: ["fileId", "pageNumber"],
        },
      },
    ];
  }

  // Translates canonical Quran input to Bahouth format
  public toBahouthVerseKey(input: CanonicalQuranAyahInput): string {
    return `${input.surah}-${input.ayah}`;
  }

  // Maps loose model input onto Aljam3's exact tool arguments.
  // Aljam3 tools declare additionalProperties: false, so unknown keys are hard errors upstream.
  public toAljam3Args(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const aliases: Record<string, string> = {
      query: "q",
      q: "q",
      limit: "per_page",
      perPage: "per_page",
      per_page: "per_page",
      authorId: "author_id",
      author_id: "author_id",
      authors: "author_id",
      categoryId: "category_id",
      category_id: "category_id",
      categories: "category_id",
      libraryId: "library_id",
      library_id: "library_id",
      libraries: "library_id",
      bookId: "book_id",
      book_id: "book_id",
      books: "book_id",
      fileId: "file_id",
      file_id: "file_id",
      pageNumber: "page_number",
      page_number: "page_number",
      maxChars: "max_chars",
      max_chars: "max_chars",
      offset: "offset",
      page: "page",
      id: "id",
      locale: "locale",
    };

    const allowed: Record<string, Set<string>> = {
      search: new Set(["q", "page", "per_page", "author_id", "category_id", "library_id", "book_id", "locale"]),
      list_books: new Set(["q", "page", "per_page", "author_id", "category_id", "library_id", "locale"]),
      get_book: new Set(["id", "page", "per_page", "locale"]),
      get_page: new Set(["file_id", "page_number", "offset", "max_chars", "locale"]),
      list_authors: new Set(["q", "page", "per_page", "locale"]),
      list_categories: new Set(["q", "page", "per_page", "locale"]),
      list_libraries: new Set(["page", "per_page", "locale"]),
    };

    const target = allowed[toolName] ?? new Set<string>();
    const mapped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      let upstreamKey = aliases[key];
      if (!upstreamKey) continue;

      // Singular filters: keep the first entry when a model sends an array
      let resolved = value;
      if (Array.isArray(value) && upstreamKey !== "q") {
        if (value.length === 0) continue;
        resolved = value[0];
      }

      // get_page reads a book page, so a bare "page" means the page number there
      if (toolName === "get_page" && upstreamKey === "page") {
        upstreamKey = "page_number";
      }
      // get_book identifies a book with "id", not "book_id"
      if (toolName === "get_book" && upstreamKey === "book_id") {
        upstreamKey = "id";
      }
      if (upstreamKey === "page_number" && toolName !== "get_page") continue;
      if (!target.has(upstreamKey)) continue;

      mapped[upstreamKey] = resolved;
    }

    // Coerce numeric-looking strings so a model sending "10" is not rejected by
    // the integer-typed upstream schema; drop values that are not numeric at all
    // so upstream defaults apply instead of a 400.
    for (const key of [
      "per_page",
      "page",
      "page_number",
      "offset",
      "max_chars",
      "file_id",
      "book_id",
      "author_id",
      "category_id",
      "library_id",
      "id",
    ]) {
      const value = mapped[key];
      if (typeof value !== "string") continue;
      const parsed = Number(value.trim());
      if (value.trim() !== "" && Number.isFinite(parsed)) {
        mapped[key] = parsed;
      } else {
        delete mapped[key];
      }
    }

    // Enforce the upstream schema bounds
    if (typeof mapped.q === "string") {
      mapped.q = mapped.q.trim().slice(0, 500);
      if (!mapped.q) delete mapped.q;
    }
    if (typeof mapped.per_page === "number") {
      mapped.per_page = Math.min(20, Math.max(1, Math.trunc(mapped.per_page)));
    }
    if (typeof mapped.page === "number") {
      mapped.page = Math.min(100, Math.max(1, Math.trunc(mapped.page)));
    }
    if (typeof mapped.page_number === "number") {
      mapped.page_number = Math.max(1, Math.trunc(mapped.page_number));
    }
    if (typeof mapped.offset === "number") {
      mapped.offset = Math.max(0, Math.trunc(mapped.offset));
    }
    if (typeof mapped.max_chars === "number") {
      mapped.max_chars = Math.min(12000, Math.max(1, Math.trunc(mapped.max_chars)));
    }

    return mapped;
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

    if (providerId === "aljam3") {
      return this.toAljam3Args(toolName, args);
    }

    return args;
  }
}
