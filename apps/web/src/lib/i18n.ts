import type { UsageLimitKey } from "@waqf/types";
import ar from "../lang/ar.json";
import en from "../lang/en.json";
import tr from "../lang/tr.json";
import id from "../lang/id.json";
import ms from "../lang/ms.json";

export type SupportedLocale = "ar" | "en" | "tr" | "id" | "ms";

export const LOCALES: Record<SupportedLocale, { name: string; dir: "rtl" | "ltr" }> = {
  ar: { name: "العربية", dir: "rtl" },
  en: { name: "English", dir: "ltr" },
  tr: { name: "Türkçe", dir: "ltr" },
  id: { name: "Bahasa Indonesia", dir: "ltr" },
  ms: { name: "Bahasa Melayu", dir: "ltr" },
};

const TRANSLATIONS: Record<SupportedLocale, typeof ar> = {
  ar,
  en,
  tr,
  id,
  ms,
};

export function getTranslations(lang: string): typeof ar {
  const normalized = (lang in TRANSLATIONS ? lang : "ar") as SupportedLocale;
  return TRANSLATIONS[normalized];
}

export function getDir(lang: string): "rtl" | "ltr" {
  const normalized = (lang in LOCALES ? lang : "ar") as SupportedLocale;
  return LOCALES[normalized].dir;
}

/** Maps each published usage limit onto its localized label. */
const USAGE_LIMIT_LABELS: Record<UsageLimitKey, keyof typeof ar["limits"]> = {
  gateway_rate_limit: "row_gateway_rate_limit",
  gateway_body_cap: "row_gateway_body_cap",
  upstream_query_chars: "row_upstream_query_chars",
  upstream_list_page: "row_upstream_list_page",
  upstream_excerpt_chars: "row_upstream_excerpt_chars",
  upstream_page_text_chars: "row_upstream_page_text_chars",
  upstream_rate_limit: "row_upstream_rate_limit",
  upstream_retry: "row_upstream_retry",
  upstream_languages: "row_upstream_languages",
};

export function usageLimitLabel(t: typeof ar, key: UsageLimitKey): string {
  return t.limits[USAGE_LIMIT_LABELS[key]];
}

export function formatToolsCount(count: number, lang: string, t: typeof ar): string {
  const normalized = (lang in LOCALES ? lang : "ar") as SupportedLocale;
  const pr = new Intl.PluralRules(normalized);
  const rule = pr.select(count);

  let template: string;
  switch (rule) {
    case "zero":
      template = t.servers.tools_count_zero || t.servers.tools_count_other;
      break;
    case "one":
      template = t.servers.tools_count_one || t.servers.tools_count_other;
      break;
    case "two":
      template = t.servers.tools_count_two || t.servers.tools_count_other;
      break;
    case "few":
      template = t.servers.tools_count_few || t.servers.tools_count_other;
      break;
    case "many":
      template = t.servers.tools_count_many || t.servers.tools_count_other;
      break;
    case "other":
    default:
      template = t.servers.tools_count_other;
      break;
  }

  return template.replace("{count}", String(count));
}

