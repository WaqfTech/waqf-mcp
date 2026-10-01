# Fact Sheet: Provider Parameter Heterogeneity & Fallbacks

## Context & Finding
During live testing across upstream providers:
1. **Bahouth** requires verse keys formatted with a hyphen (`"112-1"`), rejecting `"112:1"` or individual numerical properties (`surah_number`, `verse_number`), throwing a Pydantic schema validation error.
2. **Tafsir.net** requires individual numerical properties (`surah: 112`, `ayah: 1`).
3. If Tafsir.net encounters rate limits or upstream downtime, our canonical tool `waqf_quran_get_ayah` should seamlessly fall back to Bahouth by translating `{ surah, ayah }` to `verse_key: "${surah}-${ayah}"`.
4. Similarly, direct calls to `bahouth__get_verse` should be made resilient by accepting `{ surah, ayah }`, `verse_key: "112:1"`, or `verse_key: "112-1"` transparently before delegating upstream.

## Architecture
- Upstream adapters in `apps/api/src/adapters/` should have input normalization pre-hooks.
- Canonical router in `apps/api/src/canonical/index.ts` implements primary-fallback chaining with D1 caching.
