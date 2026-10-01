export interface CanonicalQuranAyahInput {
  surah: number;
  ayah: number;
  includeTajweed?: boolean;
  includeTafsir?: boolean;
  tafsirSource?: string;
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
