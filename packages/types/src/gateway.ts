/**
 * Gateway-level facts shared by the landing page and the API docs.
 *
 * Same convention as catalog.ts: machine identifiers, URLs, protocol names and
 * numeric limits live here; every natural-language word lives in
 * apps/web/src/lang/*.json.
 */

import { type ProviderId } from "./catalog";

/** Human-facing site: landing page, docs for readers, sitemap, canonical URLs. */
export const GATEWAY_SITE_URL = "https://mcp.waqf.dev";
/** Protocol endpoint agents configure in their MCP client. */
export const GATEWAY_MCP_URL = "https://mcp.waqf.app/mcp";
export const GATEWAY_TRANSPORT_LABEL = "MCP Streamable HTTP";

export type WebAssistantId = "claude_web" | "chatgpt_web" | "gemini_web";

export interface WebAssistantGuide {
  id: WebAssistantId;
  /** Deep link that opens the client's own connector screen. */
  setUpUrl: string;
  /** Official vendor guide for adding a custom MCP connector; null hides the link. */
  docsUrl: string | null;
}

export const WEB_ASSISTANT_GUIDES: readonly WebAssistantGuide[] = [
  {
    id: "claude_web",
    setUpUrl: "https://claude.ai/new#customize/connectors",
    docsUrl: "https://claude.com/docs/connectors/custom/add-unlisted",
  },
  {
    id: "chatgpt_web",
    setUpUrl: "https://chatgpt.com/plugins",
    docsUrl: "https://developers.openai.com/plugins/quickstart",
  },
  {
    id: "gemini_web",
    setUpUrl: "https://gemini.google.com/apps",
    docsUrl: "https://gemini.google.com/apps",
  },
];

export type UsageLimitKey =
  | "gateway_rate_limit"
  | "gateway_body_cap"
  | "upstream_query_chars"
  | "upstream_list_page"
  | "upstream_excerpt_chars"
  | "upstream_page_text_chars"
  | "upstream_rate_limit"
  | "upstream_retry"
  | "upstream_languages";

export interface UsageLimitRow {
  key: UsageLimitKey;
  /** Numeric/code value rendered verbatim; null means the row is not published. */
  value: string | null;
  source: "gateway" | "upstream";
  providerId?: ProviderId;
}

export const GATEWAY_USAGE_LIMITS: readonly UsageLimitRow[] = [
  // Documented fair-use ceiling for the gateway; see /auth.md.
  { key: "gateway_rate_limit", value: "120", source: "gateway" },
  // Enforced: the Worker rejects request bodies above 1 MB with HTTP 413.
  { key: "gateway_body_cap", value: "1", source: "gateway" },
  // Published policy of the Aljam3 upstream, not a gateway limit.
  { key: "upstream_query_chars", value: "500", source: "upstream", providerId: "aljam3" },
  { key: "upstream_list_page", value: "10 / 20", source: "upstream", providerId: "aljam3" },
  { key: "upstream_excerpt_chars", value: "1000", source: "upstream", providerId: "aljam3" },
  { key: "upstream_page_text_chars", value: "6000 / 12000", source: "upstream", providerId: "aljam3" },
  { key: "upstream_rate_limit", value: "300", source: "upstream", providerId: "aljam3" },
  { key: "upstream_retry", value: "60", source: "upstream", providerId: "aljam3" },
  { key: "upstream_languages", value: "ar / ur / en", source: "upstream", providerId: "aljam3" },
];

/** Upstream named by the rows above, for the section's attribution line. */
export const USAGE_LIMITS_UPSTREAM_PROVIDER: ProviderId = "aljam3";

export const SECTION_SEQUENCE = [
  "hero",
  "connect",
  "servers",
  "config",
  "limits",
  "prompts",
  "submit",
  "faq",
] as const;

export type SectionId = (typeof SECTION_SEQUENCE)[number];

/** Two-digit ordinal used by section eyebrows, e.g. "03". */
export function sectionNumber(id: SectionId): string {
  const index = SECTION_SEQUENCE.indexOf(id);
  return String(index + 1).padStart(2, "0");
}
