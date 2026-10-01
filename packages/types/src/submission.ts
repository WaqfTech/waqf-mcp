export interface NewMcpSubmission {
  id?: string;
  submitterName: string;
  submitterEmail: string;
  serverName: string;
  serverUrl: string;
  description: string;
  category: "quran" | "hadith" | "tafsir" | "fiqh" | "tools";
  status?: "pending" | "verified" | "rejected";
  createdAt?: string;
}
