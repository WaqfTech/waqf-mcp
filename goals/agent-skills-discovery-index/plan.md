# Plan: Publish Agent Skills Discovery Index (RFC v0.2.0)

## Execution Steps
- [x] **Phase 1**: 1. Create apps/web/public/.well-known/agent-skills/index.json with $schema and skills catalog
- [x] **Phase 2**: 2. Register Quran, Hadith, Tafsir, and Fihris research skills with calculated sha256 hashes
- [x] **Phase 3**: 3. Expose via apps/api/src/index.ts and write unit tests in apps/api/test/e2e.test.ts
