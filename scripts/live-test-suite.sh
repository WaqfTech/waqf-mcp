#!/usr/bin/env bash
set -uo pipefail

API_URL="${API_URL:-https://waqf-mcp-api.waqf.workers.dev}"
WEB_URL="${WEB_URL:-https://waqf-mcp-web.waqf.workers.dev}"

echo "=========================================================="
echo "Starting Comprehensive Edge Verification Tests"
echo "API Endpoint: $API_URL"
echo "WEB Endpoint: $WEB_URL"
echo "=========================================================="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

assert_status() {
  local test_name="$1"
  local actual_status="$2"
  local expected_status="$3"
  local extra_info="${4:-}"

  if [[ "$actual_status" == "$expected_status" ]]; then
    echo "  [PASS] $test_name (HTTP $actual_status) $extra_info"
    ((PASS_COUNT++))
  else
    echo "  [FAIL] $test_name (Expected HTTP $expected_status, got $actual_status) $extra_info"
    ((FAIL_COUNT++))
  fi
}

echo "=== 1. Gateway Discovery & Routing Tests ==="
STATUS=$(curl -s -o /tmp/resp_disc.json -w "%{http_code}" "$API_URL/")
assert_status "GET / Discovery endpoint" "$STATUS" "200"

STATUS=$(curl -s -o /tmp/resp_disc_mcp.json -w "%{http_code}" "$API_URL/mcp")
assert_status "GET /mcp Discovery endpoint" "$STATUS" "200"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$API_URL/mcp" \
  -H "Origin: https://mcp.waqf.dev" \
  -H "Access-Control-Request-Method: POST")
assert_status "OPTIONS /mcp CORS Preflight" "$STATUS" "204"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/invalid-random-path")
assert_status "GET /invalid-random-path (Unknown route)" "$STATUS" "404"

echo ""
echo "=== 2. JSON-RPC Protocol & Schema Edge Cases ==="
# Malformed JSON
STATUS=$(curl -s -o /tmp/resp_invalid_json.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d "not-valid-json-string")
assert_status "POST /mcp with malformed JSON" "$STATUS" "400"

# Unknown JSON-RPC method (returns 404 with code -32601)
STATUS=$(curl -s -o /tmp/resp_unknown_method.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":100,"method":"non_existent_method","params":{}}')
assert_status "POST /mcp with unknown RPC method" "$STATUS" "404"
ERR_CODE=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/resp_unknown_method.json','utf8')).error?.code || 'none'")
echo "    -> JSON-RPC Error code: $ERR_CODE"

# Ping method
STATUS=$(curl -s -o /tmp/resp_ping.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":101,"method":"ping","params":{}}')
assert_status "POST /mcp ping method" "$STATUS" "200"

# Initialize handshake
STATUS=$(curl -s -o /tmp/resp_init.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":102,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"suite-test","version":"1.0.0"}}}')
assert_status "POST /mcp initialize handshake" "$STATUS" "200"

# Tools list (all)
STATUS=$(curl -s -o /tmp/resp_tools.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":103,"method":"tools/list","params":{}}')
assert_status "POST /mcp tools/list (all)" "$STATUS" "200"
TOOL_COUNT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/resp_tools.json','utf8')).result?.tools?.length || 0")
echo "    -> Total Tools Registered: $TOOL_COUNT"

# Tools list with suite filter: core
STATUS=$(curl -s -o /tmp/resp_tools_core.json -w "%{http_code}" -X POST "$API_URL/mcp?suite=core" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":104,"method":"tools/list","params":{}}')
assert_status "POST /mcp?suite=core tools/list" "$STATUS" "200"
CORE_COUNT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/resp_tools_core.json','utf8')).result?.tools?.length || 0")
echo "    -> Core Tools Count: $CORE_COUNT"

# Tools list with suite filter: quran
STATUS=$(curl -s -o /tmp/resp_tools_quran.json -w "%{http_code}" -X POST "$API_URL/mcp?suite=quran" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":105,"method":"tools/list","params":{}}')
assert_status "POST /mcp?suite=quran tools/list" "$STATUS" "200"
QURAN_COUNT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/resp_tools_quran.json','utf8')).result?.tools?.length || 0")
echo "    -> Quran Suite Tools Count: $QURAN_COUNT"

echo ""
echo "=== 3. Canonical Tools & Upstream Provider Calls ==="

# 3.1 waqf_quran_get_ayah (Valid Surah 112, Ayah 1)
STATUS=$(curl -s -o /tmp/resp_ayah.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":106,"method":"tools/call","params":{"name":"waqf_quran_get_ayah","arguments":{"surah":112,"ayah":1}}}')
assert_status "POST /mcp tools/call: waqf_quran_get_ayah (Surah 112, Ayah 1)" "$STATUS" "200"

# 3.2 waqf_quran_get_ayah (Invalid Surah Number: 150 > 114)
STATUS=$(curl -s -o /tmp/resp_invalid_surah.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":107,"method":"tools/call","params":{"name":"waqf_quran_get_ayah","arguments":{"surah":150,"ayah":1}}}')
assert_status "POST /mcp tools/call: waqf_quran_get_ayah (Surah 150 out of bounds)" "$STATUS" "200"
IS_ERR=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/resp_invalid_surah.json','utf8')).result?.isError || false")
echo "    -> Returned Tool isError flag: $IS_ERR"

# 3.3 waqf_hadith_search
STATUS=$(curl -s -o /tmp/resp_hadith.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":108,"method":"tools/call","params":{"name":"waqf_hadith_search","arguments":{"query":"إنما الأعمال بالنيات","limit":2}}}')
assert_status "POST /mcp tools/call: waqf_hadith_search ('إنما الأعمال بالنيات')" "$STATUS" "200"

# 3.4 waqf_turath_search_books
STATUS=$(curl -s -o /tmp/resp_turath_books.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":109,"method":"tools/call","params":{"name":"waqf_turath_search_books","arguments":{"query":"صحيح البخاري","limit":3}}}')
assert_status "POST /mcp tools/call: waqf_turath_search_books ('صحيح البخاري')" "$STATUS" "200"

# 3.5 Upstream Bahouth direct tool (bahouth__get_verse)
STATUS=$(curl -s -o /tmp/resp_bahouth.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":110,"method":"tools/call","params":{"name":"bahouth__get_verse","arguments":{"verse_key":"112-1"}}}')
assert_status "POST /mcp tools/call: bahouth__get_verse ('112-1')" "$STATUS" "200"

# 3.6 Upstream Maher Al-Fahel direct tool (maheralfahel__get-site-info)
STATUS=$(curl -s -o /tmp/resp_maher.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":111,"method":"tools/call","params":{"name":"maheralfahel__get-site-info","arguments":{}}}')
assert_status "POST /mcp tools/call: maheralfahel__get-site-info" "$STATUS" "200"

# 3.7 Upstream Tafsir.net direct tool (tafsir_net__search_quran_text)
STATUS=$(curl -s -o /tmp/resp_tafsir_search.json -w "%{http_code}" -X POST "$API_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":112,"method":"tools/call","params":{"name":"tafsir_net__search_quran_text","arguments":{"query":"الحمد لله"}}}')
assert_status "POST /mcp tools/call: tafsir_net__search_quran_text ('الحمد لله')" "$STATUS" "200"

echo ""
echo "=== 4. Security & Boundary Checks ==="

# 4.1 Submissions API: Valid submission
STATUS=$(curl -s -o /tmp/resp_sub_valid.json -w "%{http_code}" -X POST "$API_URL/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"submitterName":"Edge Tester","submitterEmail":"tester@waqf.dev","serverName":"Hadith Verification Node","serverUrl":"https://mcp.hadith.org/mcp","category":"hadith","description":"Comprehensive hadith sanity test"}')
assert_status "POST /api/submissions (Valid submission)" "$STATUS" "201"

# 4.2 Submissions API: Missing required field
STATUS=$(curl -s -o /tmp/resp_sub_invalid.json -w "%{http_code}" -X POST "$API_URL/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"submitterName":"Incomplete","description":"Missing email and url"}')
assert_status "POST /api/submissions (Missing fields)" "$STATUS" "400"

# 4.3 Submissions API: Disallowed protocol (javascript:)
STATUS=$(curl -s -o /tmp/resp_sub_xss.json -w "%{http_code}" -X POST "$API_URL/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"submitterName":"Hacker","submitterEmail":"hack@example.com","serverName":"Malicious Server","serverUrl":"javascript:alert(1)","category":"tools","description":"XSS probe"}')
assert_status "POST /api/submissions (Disallowed URL scheme)" "$STATUS" "400"

# 4.4 Large payload check (>1MB)
STATUS=$(python3 -c '
import urllib.request, urllib.error
url = "'"$API_URL"'/mcp"
big_payload = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{\"big\":\"" + b"A" * (1024 * 1024 + 500) + b"\"}}"
req = urllib.request.Request(url, data=big_payload, headers={"Content-Type": "application/json", "User-Agent": "curl/8.14.1"})
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.status)
except urllib.error.HTTPError as e:
    print(e.code)
')
assert_status "POST /mcp with >1MB payload" "$STATUS" "413"

echo ""
echo "=== 5. Web Landing Portal & Static Assets ==="

# 5.1 Root page (Default Arabic)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/")
assert_status "GET / (Arabic default landing page)" "$STATUS" "200"

# 5.2 Multilingual paths
for lang in en tr id ms; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/$lang/")
  assert_status "GET /$lang/ ($lang landing page)" "$STATUS" "200"
done

# 5.3 Static SVG Asset
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/waqftech-logo.svg")
assert_status "GET /waqftech-logo.svg" "$STATUS" "200"

# 5.4 404 Route on Web
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/non-existent-page-xyz")
assert_status "GET /non-existent-page-xyz (Web 404)" "$STATUS" "404"

echo ""
echo "=========================================================="
echo "Summary: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "=========================================================="

if [[ $FAIL_COUNT -gt 0 ]]; then
  exit 1
fi
exit 0
