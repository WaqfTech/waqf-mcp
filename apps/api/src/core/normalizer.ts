import type {
  CanonicalEvidenceItem,
  CanonicalQuranAyahInput,
  CanonicalResultEnvelope,
  OcrStatus,
  ToolDefinition,
  ToolResult,
} from "@waqf/types";

export interface NormalizeToolContext {
  providerId?: string;
  query?: string;
  mode?: string;
  limit?: number;
  page?: number;
  hasMore?: boolean;
  warnings?: string[];
}

export const CANONICAL_RESULT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["schema_version", "status", "query", "results", "pagination", "warnings"],
  properties: {
    schema_version: { type: "string", const: "1.0.0" },
    trust_boundary: { type: "string", const: "external_untrusted_source" },
    status: { type: "string", enum: ["ok", "no_results", "partial_results", "error"] },
    query: {
      type: "object",
      required: ["original", "mode", "limit"],
      properties: {
        original: { type: "string" },
        mode: { type: "string" },
        limit: { type: ["integer", "null"] },
      },
    },
    results: {
      type: "array",
      items: {
        type: "object",
        required: ["result_id", "kind", "provider", "work", "location", "content", "citation", "provenance"],
        properties: {
          result_id: { type: "string" },
          kind: {
            type: "string",
            enum: ["quran_ayah", "book_passage", "book_page", "catalog_entry", "web_result", "raw_text"],
          },
          provider: { type: "string" },
          work: {
            type: "object",
            properties: {
              id: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
              author: { type: ["string", "null"] },
              edition: { type: ["string", "null"] },
            },
          },
          location: {
            type: "object",
            properties: {
              volume_label: { type: ["string", "null"] },
              printed_page_label: { type: ["string", "null"] },
              digital_page_number: { type: ["integer", "null"] },
              page_id: { type: ["string", "null"] },
              file_id: { type: ["integer", "null"] },
              offset: { type: ["integer", "null"] },
              next_offset: { type: ["integer", "null"] },
            },
          },
          content: {
            type: "object",
            required: ["verbatim", "is_excerpt", "language", "ocr_status"],
            properties: {
              verbatim: { type: "string" },
              is_excerpt: { type: "boolean" },
              language: { type: ["string", "null"] },
              ocr_status: { type: "string", enum: ["unknown", "verified_clean", "possible_ocr_errors"] },
            },
          },
          citation: {
            type: "object",
            required: ["source_url", "pdf_url", "citation_markdown", "verification_status"],
            properties: {
              source_url: { type: ["string", "null"] },
              pdf_url: { type: ["string", "null"] },
              citation_markdown: { type: ["string", "null"] },
              verification_status: { type: "string", enum: ["unverified", "resolved", "broken", "ambiguous"] },
            },
          },
          provenance: {
            type: "object",
            required: ["retrieved_at", "source_version", "content_hash"],
            properties: {
              retrieved_at: { type: "string" },
              source_version: { type: ["string", "null"] },
              content_hash: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    pagination: {
      type: "object",
      required: ["page", "limit", "total", "has_more", "next_cursor"],
      properties: {
        page: { type: ["integer", "null"] },
        limit: { type: ["integer", "null"] },
        total: { type: ["integer", "null"] },
        has_more: { type: "boolean" },
        next_cursor: { type: ["string", "null"] },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

function detectOcrStatus(record: Record<string, unknown>, rawText: string): OcrStatus {
  const explicit = asString(record.ocr_status);
  if (explicit === "verified_clean" || explicit === "possible_ocr_errors") {
    return explicit;
  }
  const warning = asString(record.ocr_warning) ?? asString(record.notice) ?? "";
  if (/ocr/i.test(warning) || /ocr/i.test(rawText)) {
    return "possible_ocr_errors";
  }
  return "unknown";
}

function buildCitationMarkdown(
  record: Record<string, unknown>,
  title: string | null,
  sourceUrl: string | null,
  printedPage: string | null,
  digitalPage: number | null
): string | null {
  const citation = asRecord(record.citation);
  const upstreamMd = asString(citation?.markdown) ?? asString(record.citation_markdown);
  if (upstreamMd) {
    return upstreamMd;
  }
  if (!sourceUrl) {
    return null;
  }
  const label = title ?? sourceUrl;
  const pageHint = printedPage
    ? ` (p. ${printedPage})`
    : digitalPage !== null
      ? ` (file p. ${digitalPage})`
      : "";
  return `[${label}${pageHint}](${sourceUrl})`;
}

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
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
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
              minimum: 1,
              maximum: 20,
              default: 5,
              description: "Maximum number of results to return",
            },
          },
          required: ["query"],
        },
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
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
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
      },
      {
        name: "waqf_search_scholarship",
        description:
          "Search across vetted Islamic scholarship portals (fatwas, research, classical treatises) using Fihris Islamic Search.",
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
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
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
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
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
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
      },
      {
        name: "waqf_research_search",
        description:
          "Run a concurrent federated research query across relevant Islamic providers by scholarly domain, returning attributed evidence, citation metadata, and partial-failure warnings without merging distinct editions or positions.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              maxLength: 500,
              description: "Research query in Arabic or English",
            },
            domain: {
              type: "string",
              enum: [
                "quran",
                "tafsir",
                "hadith",
                "fiqh",
                "aqidah",
                "linguistics",
                "history",
                "biography",
                "general",
              ],
              default: "general",
              description: "Scholarly domain used to select candidate providers when providers is 'auto'",
            },
            providers: {
              oneOf: [
                { type: "string", enum: ["auto"] },
                {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "tafsir_net",
                      "bahouth",
                      "turath",
                      "maheralfahel",
                      "fihris",
                      "aljam3",
                      "shamela",
                    ],
                  },
                },
              ],
              default: "auto",
              description: "Provider selection: 'auto' for domain routing, or an explicit list of provider IDs",
            },
            max_results: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 10,
              description: "Maximum total evidence items to return across providers",
            },
            language: {
              type: "string",
              default: "ar",
              description: "Preferred query/link language code (default: 'ar')",
            },
          },
          required: ["query"],
        },
        outputSchema: CANONICAL_RESULT_OUTPUT_SCHEMA,
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

  /**
   * Bounds oversized upstream list payloads (e.g. turath__search_turath) to the
   * caller's requested limit without altering any retained item's verbatim text.
   */
  public boundResultList(
    raw: ToolResult,
    limit: number
  ): { result: ToolResult; hasMore: boolean; total: number | null } {
    const safeLimit = Math.min(20, Math.max(1, Math.trunc(limit)));
    if (raw.isError || !raw.content.length) {
      return { result: raw, hasMore: false, total: null };
    }

    const first = raw.content[0];
    if (first.type !== "text") {
      return { result: raw, hasMore: false, total: null };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(first.text);
    } catch {
      return { result: raw, hasMore: false, total: null };
    }

    if (Array.isArray(parsed)) {
      const hasMore = parsed.length > safeLimit;
      if (!hasMore) {
        return { result: raw, hasMore: false, total: parsed.length };
      }
      return {
        hasMore: true,
        total: parsed.length,
        result: {
          ...raw,
          content: [{ type: "text", text: JSON.stringify(parsed.slice(0, safeLimit)) }, ...raw.content.slice(1)],
        },
      };
    }

    const obj = asRecord(parsed);
    if (!obj) {
      return { result: raw, hasMore: false, total: null };
    }

    for (const key of ["results", "items", "hits", "data"] as const) {
      const list = obj[key];
      if (!Array.isArray(list)) continue;
      const total = asInt(obj.total) ?? asInt(obj.count) ?? list.length;
      const hasMore = list.length > safeLimit || Boolean(obj.has_more) || Boolean(obj.next_cursor);
      if (list.length <= safeLimit) {
        return { result: raw, hasMore, total };
      }
      const boundedObj = {
        ...obj,
        [key]: list.slice(0, safeLimit),
        returned_count: safeLimit,
        total_available: total,
      };
      return {
        hasMore: true,
        total,
        result: {
          ...raw,
          content: [{ type: "text", text: JSON.stringify(boundedObj) }, ...raw.content.slice(1)],
        },
      };
    }

    return { result: raw, hasMore: false, total: null };
  }

  private mapRecordToEvidenceItem(
    entry: unknown,
    index: number,
    providerId: string,
    retrievedAt: string,
    rawFallbackText: string
  ): CanonicalEvidenceItem {
    const rec = asRecord(entry);
    if (!rec) {
      const text = typeof entry === "string" ? entry : JSON.stringify(entry);
      return {
        result_id: `${providerId}_${index + 1}`,
        kind: "raw_text",
        provider: providerId,
        work: { id: null, title: null, author: null, edition: null },
        location: {
          volume_label: null,
          printed_page_label: null,
          digital_page_number: null,
          page_id: null,
          file_id: null,
          offset: null,
          next_offset: null,
        },
        content: {
          verbatim: text,
          is_excerpt: false,
          language: null,
          ocr_status: detectOcrStatus({}, text),
        },
        citation: {
          source_url: null,
          pdf_url: null,
          citation_markdown: null,
          verification_status: "unverified",
        },
        provenance: {
          retrieved_at: retrievedAt,
          source_version: null,
          content_hash: null,
        },
      };
    }

    const workObj = asRecord(rec.book) ?? asRecord(rec.work) ?? asRecord(rec.meta);
    const citationObj = asRecord(rec.citation);
    const title =
      asString(rec.book_title) ??
      asString(rec.title) ??
      asString(rec.name) ??
      asString(workObj?.title) ??
      asString(workObj?.name);
    const author =
      asString(rec.author_name) ??
      asString(rec.author) ??
      asString(asRecord(rec.author)?.name) ??
      asString(workObj?.author);
    const workId =
      asString(rec.book_id) ??
      asString(workObj?.id) ??
      asString(rec.surah) ??
      asString(rec.id);
    const edition = asString(rec.edition) ?? asString(workObj?.edition);

    const isQuran = rec.surah !== undefined || rec.verse_key !== undefined || rec.text_uthmani !== undefined;
    const isPage = rec.file_id !== undefined && rec.page_number !== undefined && rec.text !== undefined;
    const isWeb = rec.displayUrl !== undefined || (rec.url !== undefined && rec.snippet !== undefined);
    const kind: CanonicalEvidenceItem["kind"] = isQuran
      ? "quran_ayah"
      : isPage
        ? "book_page"
        : isWeb
          ? "web_result"
          : rec.text !== undefined || rec.snip !== undefined || rec.excerpt !== undefined
            ? "book_passage"
            : title !== null
              ? "catalog_entry"
              : "raw_text";

    // Preserve exact verbatim source text without mutating diacritics or orthography.
    const verbatim =
      (typeof rec.text_uthmani === "string" && rec.text_uthmani) ||
      (typeof rec.text === "string" && rec.text) ||
      (typeof rec.excerpt === "string" && rec.excerpt) ||
      (typeof rec.snip === "string" && rec.snip) ||
      (typeof rec.snippet === "string" && rec.snippet) ||
      (typeof rec.description === "string" && rec.description) ||
      rawFallbackText;

    const sourceUrl =
      asString(rec.source_url) ??
      asString(citationObj?.url) ??
      asString(rec.url) ??
      asString(rec.link);
    const pdfUrl = asString(rec.pdf_url) ?? asString(rec.pdf) ?? asString(citationObj?.pdf_url);

    // Never infer printed_page_label from digital_page_number.
    const printedPageLabel =
      asString(rec.printed_page_label) ?? asString(rec.printed_page) ?? asString(rec.book_page);
    const digitalPageNumber =
      asInt(rec.digital_page_number) ?? asInt(rec.file_page) ?? asInt(rec.page_number);
    const pageId =
      asString(rec.page_id) ??
      asString(rec.verse_key) ??
      (rec.surah !== undefined && rec.ayah !== undefined ? `${rec.surah}:${rec.ayah}` : null) ??
      asString(rec.page);
    const volumeLabel = asString(rec.volume_label) ?? asString(rec.volume) ?? asString(rec.vol);
    const fileId = asInt(rec.file_id);
    const offset = asInt(rec.offset);
    const nextOffset = asInt(rec.next_offset) ?? asInt(rec.nextOffset);

    const citationMarkdown = buildCitationMarkdown(
      rec,
      title,
      sourceUrl,
      printedPageLabel,
      digitalPageNumber
    );

    return {
      result_id: asString(rec.id) ?? `${providerId}_${index + 1}`,
      kind,
      provider: providerId,
      work: {
        id: workId,
        title,
        author,
        edition,
      },
      location: {
        volume_label: volumeLabel,
        printed_page_label: printedPageLabel,
        digital_page_number: digitalPageNumber,
        page_id: pageId,
        file_id: fileId,
        offset,
        next_offset: nextOffset,
      },
      content: {
        verbatim,
        is_excerpt: Boolean(rec.is_excerpt ?? (kind === "book_passage" || rec.snip !== undefined || rec.excerpt !== undefined)),
        language: asString(rec.language) ?? asString(rec.locale),
        ocr_status: detectOcrStatus(rec, verbatim),
      },
      citation: {
        source_url: sourceUrl,
        pdf_url: pdfUrl,
        citation_markdown: citationMarkdown,
        verification_status: sourceUrl || pdfUrl ? "resolved" : "unverified",
      },
      provenance: {
        retrieved_at: retrievedAt,
        source_version: asString(rec.source_version),
        content_hash: null,
      },
      raw: rec,
    };
  }

  // Normalizes diverse upstream output blocks into a unified Waqf text envelope + structuredContent
  public normalizeToolResult(
    raw: ToolResult,
    sourceTag: string,
    context: NormalizeToolContext = {}
  ): ToolResult {
    const providerId = context.providerId ?? sourceTag.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const retrievedAt = new Date().toISOString();
    const rawTextBlocks = raw.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text);
    const combinedText = rawTextBlocks.join("\n");

    let parsed: unknown = null;
    if (raw.structuredContent) {
      parsed = raw.structuredContent;
    } else if (rawTextBlocks[0]) {
      try {
        parsed = JSON.parse(rawTextBlocks[0]);
      } catch {
        parsed = null;
      }
    }

    const parsedObj = asRecord(parsed);
    let rawItems: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsedObj) {
      const list = parsedObj.results ?? parsedObj.items ?? parsedObj.hits ?? parsedObj.data;
      if (Array.isArray(list)) {
        rawItems = list;
      } else if (Object.keys(parsedObj).length > 0) {
        rawItems = [parsedObj];
      }
    } else if (combinedText.trim() !== "") {
      rawItems = [combinedText];
    }

    const results = rawItems.map((item, idx) =>
      this.mapRecordToEvidenceItem(item, idx, providerId, retrievedAt, combinedText)
    );

    const nextCursor =
      asString(parsedObj?.next_cursor) ??
      asString(parsedObj?.nextCursor) ??
      (parsedObj?.next_offset !== undefined && parsedObj?.next_offset !== null
        ? String(parsedObj.next_offset)
        : null);
    const total =
      asInt(parsedObj?.total_available) ??
      asInt(parsedObj?.total) ??
      asInt(parsedObj?.count) ??
      (results.length > 0 ? results.length : 0);
    const hasMore = Boolean(context.hasMore || parsedObj?.has_more || nextCursor);

    const status: CanonicalResultEnvelope["status"] = raw.isError
      ? "error"
      : results.length === 0
        ? "no_results"
        : "ok";

    const envelope: CanonicalResultEnvelope & { trust_boundary: "external_untrusted_source" } = {
      schema_version: "1.0.0",
      trust_boundary: "external_untrusted_source",
      status,
      query: {
        original: context.query ?? "",
        mode: context.mode ?? "default",
        limit: context.limit ?? null,
      },
      results,
      pagination: {
        page: context.page ?? asInt(parsedObj?.page) ?? null,
        limit: context.limit ?? asInt(parsedObj?.per_page) ?? null,
        total,
        has_more: hasMore,
        next_cursor: nextCursor,
      },
      warnings: [...(context.warnings ?? [])],
      ...(raw.structuredContent ? { raw: raw.structuredContent } : {}),
    };

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
      structuredContent: envelope as unknown as Record<string, unknown>,
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
