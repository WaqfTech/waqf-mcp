# Facts: Build Multi-lingual Astro Landing Page with WaqfTech Tokens

## Architectural Invariants & Constraints
- Arabic first RTL default
- Zero embedded strings - all copy in lang/{lang}.json
- Design tokens from dev.waqftech.org
- No npm - manage with aube

## File & Interface Contracts
- Relevant files:
  - `apps/web/src/components`
  - `apps/web/src/layouts`
  - `apps/web/src/pages`
  - `apps/web/src/lang`
  - `apps/web/astro.config.mjs`
