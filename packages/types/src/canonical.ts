export interface CanonicalQuranAyahInput {
  surah: number;
  ayah: number;
  includeTajweed?: boolean;
  includeTafsir?: boolean;
  tafsirSource?: string;
  includeSciences?: string[];
}

export interface CanonicalQuranAyahResult {
  surah: number;
  ayah: number;
  textUthmani: string;
  surahNameArabic?: string;
  tafsir?: {
    source: string;
    text: string;
  };
  translation?: string;
}

export interface CanonicalHadithSearchInput {
  query: string;
  collection?: "bukhari" | "muslim" | "tirmidhi" | "abudawud" | "nasai" | "ibnmajah" | "all";
  page?: number;
  limit?: number;
}

export interface CanonicalHadithItem {
  collection: string;
  hadithNumber: string | number;
  chapter?: string;
  textArabic: string;
  grade?: string;
  narrator?: string;
}

export interface CanonicalBookSearchInput {
  query: string;
  author?: string;
  category?: string;
  limit?: number;
}

export interface CanonicalBookItem {
  id: string;
  title: string;
  author?: string;
  category?: string;
  description?: string;
  url?: string;
}

export type CanonicalResultStatus = "ok" | "no_results" | "partial_results" | "error";

export type CitationVerificationStatus = "unverified" | "resolved" | "broken" | "ambiguous";

export type OcrStatus = "unknown" | "verified_clean" | "possible_ocr_errors";

export interface CanonicalEvidenceLocation {
  volume_label: string | null;
  printed_page_label: string | null;
  digital_page_number: number | null;
  page_id: string | null;
  file_id: number | null;
  offset: number | null;
  next_offset: number | null;
}

export interface CanonicalEvidenceCitation {
  source_url: string | null;
  pdf_url: string | null;
  citation_markdown: string | null;
  verification_status: CitationVerificationStatus;
}

export interface CanonicalEvidenceItem {
  result_id: string;
  kind: "quran_ayah" | "book_passage" | "book_page" | "catalog_entry" | "web_result" | "raw_text";
  provider: string;
  work: {
    id: string | null;
    title: string | null;
    author: string | null;
    edition: string | null;
  };
  location: CanonicalEvidenceLocation;
  content: {
    verbatim: string;
    is_excerpt: boolean;
    language: string | null;
    ocr_status: OcrStatus;
  };
  citation: CanonicalEvidenceCitation;
  provenance: {
    retrieved_at: string;
    source_version: string | null;
    content_hash: string | null;
  };
  raw?: unknown;
}

export interface CanonicalResultEnvelope {
  schema_version: "1.0.0";
  status: CanonicalResultStatus;
  query: {
    original: string;
    mode: string;
    limit: number | null;
  };
  results: CanonicalEvidenceItem[];
  pagination: {
    page: number | null;
    limit: number | null;
    total: number | null;
    has_more: boolean;
    next_cursor: string | null;
  };
  warnings: string[];
  raw?: unknown;
}
