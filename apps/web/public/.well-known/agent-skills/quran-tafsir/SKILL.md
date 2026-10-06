# Quran & Tafsir Research Skill

Enables AI agents to retrieve Quranic verses in Arabic Uthmani script, alongside verified classical and contemporary Tafsir (Al-Mukhtasar, Al-Muyassar, Ibn Kathir, Al-Tabari), Qira'at variants, and root morphology.

## Gateway Capabilities
- **Endpoint**: https://mcp.waqf.dev/mcp?suite=quran
- **Canonical Tool**: waqf_quran_get_ayah
- **Tafsir MCP Specialized Tools (17)**: fetch_ayah, fetch_tafsir, list_tafsir_sources, list_science_sources, list_all_sources, list_sources_for_ayah, fetch_nuzool_reason, fetch_surah_info, analyze_word, find_root_occurrences, get_root_stats, get_qeraat_variants, search_quran_text, search_in_tafsir, get_quran_overview, get_page_fawaed, get_surah_statistics
- **Resources (4)**: quran://surahs, quran://tafsirs, quran://sciences, quran://schema
- **Prompts (5)**: study_ayah, compare_tafsirs, root_study, surah_overview, tajweed_lesson

## Usage Example
Call waqf_quran_get_ayah with { "surah": 112, "ayah": 1, "includeTafsir": true, "tafsirSource": "almukhtasar", "includeSciences": ["tajweed", "gharib"] }.
