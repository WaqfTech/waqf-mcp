# Goal: Publish DNS for AI Discovery (DNS-AID) Records

## Goal Description
Publish DNS for AI Discovery (DNS-AID) records under mcp.waqf.dev (_index._agents, _a2a._agents) using ServiceMode SVCB/HTTPS records with alpn and endpoint parameters (RFC 9460).

## Dependencies & Execution Order
- **Mode**: Dependent (requires prerequisite goals)
- **Depends On**: webmcp-browser-integration
- **Sequence**: -
- **Shape**: ship
- **Tier**: immediate

## Files to Touch
- docs/dns-aid.md
- scripts/setup-dns-aid.sh

## References
- **Shared Understanding & Fact Sheet**: [`goals/dns-aid-discovery-records/facts.md`](facts.md)
- **Execution Plan**: [`goals/dns-aid-discovery-records/plan.md`](plan.md)

## Done Condition
1. All requirements described in the goal and execution plan are implemented.
2. All automated unit and integration tests pass cleanly with `-race` (`go test -race ./...` or stack equivalent).
3. Zero architectural regressions; definitions of done satisfied.
