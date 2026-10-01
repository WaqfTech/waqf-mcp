# Quran & Tafsir Research Skill

Enables AI agents to retrieve Quranic verses in Arabic Uthmani script, alongside verified classical and contemporary Tafsir (Al-Mukhtasar, Al-Muyassar, Ibn Kathir, Al-Tabari).

## Gateway Tool
- **Endpoint**: https://mcp.waqf.dev/mcp?suite=quran
- **Method**: tools/call
- **Tool**: waqf_quran_get_ayah

## Usage Example
Call waqf_quran_get_ayah with { "surah": 112, "ayah": 1, "includeTafsir": true, "tafsirSource": "almukhtasar" }.
