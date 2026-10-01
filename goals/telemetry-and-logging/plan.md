# Plan: Implement Non-Blocking Request Telemetry Logger

## Execution Steps
- [ ] **Phase 1**: Implement D1TelemetryService for structured metric collection
- [ ] **Phase 2**: Derive geo and network metadata from request.cf
- [ ] **Phase 3**: Hash client IP using crypto.subtle SHA-256
- [ ] **Phase 4**: Ensure logging is non-blocking via ctx.waitUntil
