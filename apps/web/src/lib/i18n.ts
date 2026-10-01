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
