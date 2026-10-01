#!/usr/bin/env bash
# ==============================================================================
# Setup DNS for AI Discovery (DNS-AID) Records for mcp.waqf.dev
# Conforms to RFC 9460 & draft-mozleywilliams-dnsop-dnsaid
# ==============================================================================

set -euo pipefail

ZONE_NAME="waqf.dev"
SUBDOMAIN="_agents.mcp"

echo "=== DNS-AID (DNS for AI Discovery) Provisioning Guide ==="
echo "Domain: ${ZONE_NAME}"
echo "Subdomain: ${SUBDOMAIN}.${ZONE_NAME}"
echo ""

echo "1. Required HTTPS (SVCB) Records:"
echo "   _index._agents.mcp.${ZONE_NAME}. 300 IN HTTPS 1 mcp.waqf.dev. alpn=\"h2,h3\" port=\"443\""
echo "   _mcp._agents.mcp.${ZONE_NAME}.   300 IN HTTPS 1 mcp.waqf.dev. alpn=\"h2,h3\" port=\"443\""
echo ""

echo "2. Required Fallback Discovery TXT Records:"
echo "   _index._agents.mcp.${ZONE_NAME}. 300 IN TXT \"v=aid1; uri=https://mcp.waqf.dev/.well-known/ai-catalog.json; skills=https://mcp.waqf.dev/.well-known/agent-skills/index.json\""
echo "   _mcp._agents.mcp.${ZONE_NAME}.   300 IN TXT \"v=aid1; uri=https://mcp.waqf.dev/mcp; card=https://mcp.waqf.dev/.well-known/mcp/server-card.json; proto=streamable-http\""
echo ""

echo "3. DNSSEC Status Check:"
echo "   Querying DNSSEC validation for waqf.dev via Cloudflare DNS:"
if command -v dig >/dev/null 2>&1; then
  dig +dnssec +multiline mcp.waqf.dev A @1.1.1.1 | grep -E "flags:|RRSIG" || true
else
  echo "   [dig not available, skipping live DNSSEC lookup]"
fi

echo ""
echo "=== DNS-AID Records Specification Ready ==="
