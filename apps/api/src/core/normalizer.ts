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

  // Maps loose model input onto Shamela's exact tool arguments.
  // All four Shamela tools declare additionalProperties: false, so unknown keys
  // are hard errors upstream (same contract as Aljam3).
  public toShamelaArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const allowed: Record<string, Set<string>> = {
      shamela_find: new Set([
        "keywords",
        "difficulty",
        "field",
        "category_ids",
        "book_queries",
        "author_queries",
        "cursor",
      ]),
      shamela_find_scoped: new Set([
        "query",
        "queries",
        "book_ids",
        "book_names",
        "author_ids",
        "author_names",
        "category_ids",
        "within_pages",
        "date_from",
        "date_to",
        "exclude_phrases",
        "sort",
        "limit",
        "map_limit",
        "difficulty",
        "field",
        "cursor",
      ]),
      shamela_open: new Set(["book_id", "page_id", "max_chars", "field", "cursor"]),
      shamela_open_many: new Set(["pages", "context", "max_total_chars"]),
    };

    const target = allowed[toolName] ?? new Set<string>();
    const mapped: Record<string, unknown> = {};

    const nonEmpty = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    };

    const phraseList = (value: unknown, maxItems: number, maxLength: number): string[] | null => {
      const items = Array.isArray(value) ? value : [value];
      const phrases: string[] = [];
      for (const item of items) {
        const phrase = nonEmpty(item);
        if (phrase) phrases.push(phrase.slice(0, maxLength));
        if (phrases.length >= maxItems) break;
      }
      return phrases.length > 0 ? phrases : null;
    };

    const idList = (value: unknown, maxItems: number): number[] | null => {
      const items = Array.isArray(value) ? value : [value];
      const ids: number[] = [];
      for (const item of items) {
        const num = typeof item === "number" ? item : Number(String(item ?? "").trim());
        if (Number.isInteger(num) && num >= 1) ids.push(num);
        if (ids.length >= maxItems) break;
      }
      return ids.length > 0 ? ids : null;
    };

    // Search phrases: models send query/q/keywords as a string or list; the find
    // tools need arrays of intact non-empty phrases.
    const phraseInput = args.keywords ?? args.query ?? args.q;
    if (target.has("keywords")) {
      const keywords = phraseList(phraseInput, 64, 1000);
      if (keywords) mapped.keywords = keywords;
    }
    if (target.has("queries") || target.has("query")) {
      if (Array.isArray(phraseInput)) {
        const queries = phraseList(phraseInput, 64, 1000);
        if (queries) mapped.queries = queries;
      } else {
        const query = nonEmpty(phraseInput);
        if (query) mapped.query = query.slice(0, 1000);
      }
    }

    // Singular camelCase aliases onto snake_case upstream keys.
    const idAliases: Record<string, string> = {
      bookId: "book_id",
      book_id: "book_id",
      pageId: "page_id",
      page_id: "page_id",
      pageNumber: "page_id",
      page_number: "page_id",
      authorId: "author_id",
    };
    for (const [from, to] of Object.entries(idAliases)) {
      if (args[from] === undefined) continue;
      const num = typeof args[from] === "number" ? args[from] : Number(String(args[from]).trim());
      if (!Number.isInteger(num as number) || (num as number) < 1) continue;
      if (to === "author_id" && target.has("author_ids")) {
        mapped.author_ids = [num];
      } else if (target.has(to)) {
        mapped[to] = num;
      } else if (to === "book_id" && target.has("book_ids")) {
        mapped.book_ids = [num];
      }
    }

    const listAliases: Record<string, { key: string; max: number }> = {
      book_ids: { key: "book_ids", max: 20 },
      books: { key: "book_ids", max: 20 },
      author_ids: { key: "author_ids", max: 20 },
      authors: { key: "author_ids", max: 20 },
      category_ids: { key: "category_ids", max: 20 },
      categoryIds: { key: "category_ids", max: 20 },
      categories: { key: "category_ids", max: 20 },
    };
    for (const [from, { key, max }] of Object.entries(listAliases)) {
      if (args[from] === undefined || !target.has(key) || mapped[key] !== undefined) continue;
      const ids = idList(args[from], max);
      if (ids) mapped[key] = ids;
    }

    const nameAliases: Record<string, { key: string; max: number }> = {
      book_queries: { key: "book_queries", max: 20 },
      bookQueries: { key: "book_queries", max: 20 },
      book_names: { key: "book_names", max: 5 },
      bookNames: { key: "book_names", max: 5 },
      author_queries: { key: "author_queries", max: 20 },
      authorQueries: { key: "author_queries", max: 20 },
      author_names: { key: "author_names", max: 5 },
      authorNames: { key: "author_names", max: 5 },
      exclude_phrases: { key: "exclude_phrases", max: 5 },
      excludePhrases: { key: "exclude_phrases", max: 5 },
    };
    for (const [from, { key, max }] of Object.entries(nameAliases)) {
      if (args[from] === undefined || !target.has(key)) continue;
      const names = phraseList(args[from], max, 200);
      if (names) mapped[key] = names;
    }

    // open_many page entries: normalize each {bookId, pageId} object.
    if (target.has("pages") && Array.isArray(args.pages)) {
      const pages: Record<string, unknown>[] = [];
      for (const entry of args.pages.slice(0, 8)) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const raw = entry as Record<string, unknown>;
        const bookId = raw.book_id ?? raw.bookId;
        const pageId = raw.page_id ?? raw.pageId ?? raw.page_number ?? raw.pageNumber;
        const bookNum = typeof bookId === "number" ? bookId : Number(String(bookId ?? "").trim());
        const pageNum = typeof pageId === "number" ? pageId : Number(String(pageId ?? "").trim());
        if (!Number.isInteger(bookNum) || bookNum < 1 || !Number.isInteger(pageNum) || pageNum < 1) {
          continue;
        }
        pages.push({ book_id: bookNum, page_id: pageNum });
      }
      if (pages.length > 0) mapped.pages = pages;
    }

    // Scoped within_pages entries share the same {book_id, page_id} shape.
    if (target.has("within_pages") && Array.isArray(args.within_pages)) {
      const locations: Record<string, unknown>[] = [];
      for (const entry of (args.within_pages as unknown[]).slice(0, 20)) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const raw = entry as Record<string, unknown>;
        const bookNum = Number(String(raw.book_id ?? raw.bookId ?? "").trim());
        const pageNum = Number(String(raw.page_id ?? raw.pageId ?? "").trim());
        if (!Number.isInteger(bookNum) || bookNum < 1 || !Number.isInteger(pageNum) || pageNum < 1) {
          continue;
        }
        locations.push({ book_id: bookNum, page_id: pageNum });
      }
      if (locations.length > 0) mapped.within_pages = locations;
    }

    // Enum passthrough: only exact upstream values survive.
    if (typeof args.difficulty === "string" && target.has("difficulty")) {
      const difficulty = args.difficulty.trim();
      if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
        mapped.difficulty = difficulty;
      }
    }
    if (typeof args.field === "string" && target.has("field")) {
      const field = args.field.trim();
      if (field === "body" || field === "footnotes") mapped.field = field;
    }
    if (typeof args.sort === "string" && target.has("sort")) {
      const sort = args.sort.trim();
      if (sort === "relevance" || sort === "date_asc" || sort === "date_desc") {
        mapped.sort = sort;
      }
    }
    if (typeof args.cursor === "string" && target.has("cursor")) {
      const cursor = nonEmpty(args.cursor);
      if (cursor) mapped.cursor = cursor.slice(0, 4096);
    }

    // Bounded numerics with upstream defaults left to apply when absent.
    const boundedInt = (value: unknown, min: number, max: number): number | null => {
      const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
      if (!Number.isFinite(num)) return null;
      return Math.min(max, Math.max(min, Math.trunc(num)));
    };
    const bounds: Record<string, [number, number]> = {
      max_chars: [500, 16000],
      max_total_chars: [500, 64000],
      limit: [1, 20],
      map_limit: [0, 100],
      context: [0, 3],
      date_from: [-99999, 99999],
      date_to: [-99999, 99999],
    };
    const boundAliases: Record<string, string> = {
      maxChars: "max_chars",
      maxTotalChars: "max_total_chars",
    };
    for (const [key, [min, max]] of Object.entries(bounds)) {
      if (!target.has(key)) continue;
      const value = args[key] ?? args[Object.keys(boundAliases).find((a) => boundAliases[a] === key) ?? ""];
      if (value === undefined) continue;
      const clamped = boundedInt(value, min, max);
      if (clamped !== null) mapped[key] = clamped;
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

    if (providerId === "shamela") {
      return this.toShamelaArgs(toolName, args);
    }

    return args;
  }
}
