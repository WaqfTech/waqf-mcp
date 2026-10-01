# Execution Plan: Robust Provider Fallbacks & Schema Translation

- [ ] 1. Enhance `apps/api/src/canonical/index.ts` with explicit fallback chaining: try Tafsir.net first, catch error/timeout, translate parameters to `{ verse_key: "${surah}-${ayah}" }` and query Bahouth.
- [ ] 2. Add an input sanitizer in `apps/api/src/core/router.ts` for `bahouth__*` tools that converts colon-separated keys (`112:1`) or `{ surah, ayah }` to standard hyphenated keys (`112-1`).
- [ ] 3. Write unit tests in `apps/api/test/canonical-and-cache.test.ts` mocking a Tafsir.net network error and verifying Bahouth fallback activation.
- [ ] 4. Run `aube test` and certify goal.
