# Goal: Robust Provider Fallbacks and Schema Translation for Quran & Heritage Tools

## Goal Description
Implement bidirectional parameter translation and fallback logic for canonical tools (e.g. `waqf_quran_get_ayah` seamlessly falling back between Tafsir.net and Bahouth by translating between `{ surah, ayah }` and `verse_key: "${surah}-${ayah}"`), and parameter tolerance on upstream tool wrappers so callers passing common variants don't encounter Pydantic errors.

## Dependencies & Execution Order
- **Mode**: Dependent 🔗
- **Depends On**: canonical-schemas-and-caching
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- `apps/api/src/canonical/index.ts`
- `apps/api/src/adapters/jsonRpc.ts`
- `apps/api/src/core/router.ts`
- `apps/api/test/canonical-and-cache.test.ts`

## References
- **Shared Understanding & Fact Sheet**: [`goals/canonical-adapters-and-fallbacks/facts.md`](facts.md)
- **Execution Plan**: [`goals/canonical-adapters-and-fallbacks/plan.md`](plan.md)

## Done Condition
1. `waqf_quran_get_ayah` successfully falls back to Bahouth (`get_verse`) if Tafsir.net is unavailable.
2. `bahouth__get_verse` accepts `"112:1"` or `{ surah, ayah }` and normalizes to `"112-1"` before upstream transmission.
3. Tests verify the fallback behavior under simulated upstream failures.
