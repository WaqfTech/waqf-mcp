# Facts: Implement Non-Blocking Request Telemetry Logger

## Architectural Invariants & Constraints
- Non-blocking ctx.waitUntil only
- Anonymize IPs with salt+SHA-256 via crypto.subtle
- Zero client latency penalty

## File & Interface Contracts
- Relevant files:
  - `apps/api/src/services/telemetry.ts`
  - `apps/api/src/middleware/logger.ts`
