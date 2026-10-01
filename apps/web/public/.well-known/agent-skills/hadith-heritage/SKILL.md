# Hadith & Islamic Heritage Library Skill

Enables AI agents to query Sahih Hadith collections, verify authenticity gradings, and search classical Arabic literature across Shamela and Turath repositories.

## Gateway Tool
- **Endpoint**: https://mcp.waqf.dev/mcp?suite=turath
- **Method**: tools/call
- **Tools**: waqf_hadith_search, waqf_turath_search_books

## Usage Example
Call waqf_hadith_search with { "query": "إنما الأعمال بالنيات", "limit": 5 }.
