#!/usr/bin/env bash
# scripts/tail-all.sh — Aggregate `wrangler tail` across all Waqf MCP workers in one stream.
#
# Usage:
#   bash scripts/tail-all.sh                        # tail all prod workers
#   bash scripts/tail-all.sh --env dev              # tail dev workers
#   bash scripts/tail-all.sh --worker api           # tail a single worker (api or web)
#   bash scripts/tail-all.sh --format pretty         # one-line debug summary (default)
#   bash scripts/tail-all.sh --format json           # raw wrangler JSON (one-line, prefixed)
#   bash scripts/tail-all.sh --status-only           # only show 4xx/5xx + exceptions + logs
#   bash scripts/tail-all.sh --debug                 # show cf-ray, IP, country, cpu time
#   bash scripts/tail-all.sh --help
#
# Pretty output (default) — one line per request:
#   [api] 200 POST /mcp 12ms
#   [api] 200 POST /mcp?suite=core 5ms
#   [web] 200 GET / 3ms
#   [api] log [Telemetry] Request logged: ip_hash=... latency=12ms
#   [api] EXCEPTION Error: D1 execute failed
#
# Debug output (--debug) — adds cf-ray, IP, country, cpu time:
#   [api] 200 POST /mcp 5ms(cpu) 12ms ray=a16e3575 ip=185.193.176.147 JO
#
# Press Ctrl+C once to kill all tails and exit cleanly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKERS_JSON="$REPO_ROOT/workers.json"
FORMATTER="$REPO_ROOT/scripts/tail-formatter.js"

# ─── Defaults ────────────────────────────────────────────────────────────────
ENV="prod"
WORKER_FILTER=""
FORMAT="pretty"
STATUS_ONLY=false
DEBUG=false
VERBOSE=false

# ─── Colors ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_MAGENTA=$'\033[35m'
  C_CYAN=$'\033[36m'
  C_GRAY=$'\033[90m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""
  C_BLUE=""; C_MAGENTA=""; C_CYAN=""; C_GRAY=""
fi

# ─── Help ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${C_CYAN}${C_BOLD}Waqf MCP Aggregate Tail${C_RESET} — stream logs from all Cloudflare Workers in one view.

${C_DIM}Usage:${C_RESET}
  bash scripts/tail-all.sh [options]

${C_DIM}Options:${C_RESET}
  --env <env>          Target environment (prod|dev). Default: prod
  --worker <name>      Comma-separated worker names to tail (default: all)
  --format <fmt>       Output format: pretty (default) or json (raw wrangler output)
  --status-only        Only show 4xx/5xx errors, exceptions, and console.log
  --debug              Show cf-ray, IP, country, cpu time per request
  --verbose            Show worker list and routes on startup
  --help               Show this help

${C_DIM}Examples:${C_RESET}
  bash scripts/tail-all.sh
  bash scripts/tail-all.sh --env dev
  bash scripts/tail-all.sh --worker api
  bash scripts/tail-all.sh --status-only --debug
  bash scripts/tail-all.sh --format json

${C_DIM}Configured Workers (from workers.json):${C_RESET}
  api  → apps/api  (mcp.waqf.dev)
  web  → apps/web  (waqf.dev)

${C_DIM}Notes:${C_RESET}
  - Requires wrangler authenticated (\`npx wrangler login\`).
  - Press Ctrl+C once to stop all tails.
  - Pretty mode shows one line per request. Use --debug for cf-ray/IP/timing.
  - Static asset requests (/_astro/*, /favicon.ico) are filtered out automatically.
EOF
  exit 0
}

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)         ENV="$2"; shift 2 ;;
    --worker)      WORKER_FILTER="$2"; shift 2 ;;
    --format)      FORMAT="$2"; shift 2 ;;
    --status-only) STATUS_ONLY=true; shift ;;
    --debug)       DEBUG=true; shift ;;
    --verbose)     VERBOSE=true; shift ;;
    --help|-h)     usage ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$FORMAT" != "pretty" && "$FORMAT" != "json" ]]; then
  echo "Invalid --format: $FORMAT (use pretty or json)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js first." >&2
  exit 1
fi

if [[ ! -f "$WORKERS_JSON" ]]; then
  echo "workers.json not found at: $WORKERS_JSON" >&2
  exit 1
fi

if [[ ! -f "$FORMATTER" ]]; then
  echo "Formatter not found at: $FORMATTER" >&2
  exit 1
fi

# ─── Resolve worker names from workers.json ──────────────────────────────────
resolve_workers() {
  local env="$1"
  local filter="$2"

  node -e "
    const fs = require('fs');
    const reg = JSON.parse(fs.readFileSync('$WORKERS_JSON', 'utf8'));
    const env = '$env';
    const filter = '$filter' ? '$filter'.split(',').map(s => s.trim()) : null;

    for (const w of reg.workers) {
      const workerId = w[env] || w['prod'];
      if (!workerId) continue;
      const shortName = w.name;
      if (filter && !filter.includes(shortName) && !filter.includes(workerId)) continue;
      console.log(JSON.stringify({ name: shortName, worker: workerId, dir: w.app || '', route: w.route || '' }));
    }
  "
}

# ─── Color per worker (cycles through palette) ───────────────────────────────
color_for_worker() {
  local idx="$1"
  local colors=("$C_CYAN" "$C_GREEN" "$C_YELLOW" "$C_MAGENTA" "$C_BLUE" "$C_RED")
  echo "${colors[$(( idx % ${#colors[@]} ))]}"
}

# ─── Main ────────────────────────────────────────────────────────────────────
WORKER_LINES="$(resolve_workers "$ENV" "$WORKER_FILTER")"

if [[ -z "$WORKER_LINES" ]]; then
  echo "${C_RED}No workers found for env=$ENV${C_RESET}" >&2
  if [[ -n "$WORKER_FILTER" ]]; then
    echo "Filter was: $WORKER_FILTER" >&2
    echo "Valid workers from workers.json: api, web" >&2
  fi
  exit 1
fi

WORKER_NAMES=()
WORKER_IDS=()
WORKER_DIRS=()
WORKER_ROUTES=()

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  name="$(echo "$line" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).name")"
  wid="$(echo "$line" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).worker")"
  dir="$(echo "$line" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).dir")"
  route="$(echo "$line" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).route")"
  WORKER_NAMES+=("$name")
  WORKER_IDS+=("$wid")
  WORKER_DIRS+=("$dir")
  WORKER_ROUTES+=("$route")
done <<< "$WORKER_LINES"

COUNT="${#WORKER_IDS[@]}"

echo "${C_CYAN}${C_BOLD}Waqf MCP Aggregate Tail${C_RESET}"
echo "${C_DIM}env: ${ENV}  workers: ${COUNT}  format: ${FORMAT}  status-only: ${STATUS_ONLY}  debug: ${DEBUG}${C_RESET}"
echo "${C_DIM}Press Ctrl+C to stop.${C_RESET}"
echo ""

if $VERBOSE; then
  for i in "${!WORKER_IDS[@]}"; do
    color="$(color_for_worker "$i")"
    echo "  ${color}${WORKER_NAMES[$i]}${C_RESET} ${C_GRAY}-> ${WORKER_IDS[$i]} (${WORKER_ROUTES[$i]})${C_RESET}"
  done
  echo ""
fi

# ─── Spawn wrangler tail per worker ──────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  echo "${C_DIM}Stopping all tails...${C_RESET}" >&2
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "${C_DIM}Done.${C_RESET}" >&2
  exit 0
}
trap 'cleanup' EXIT INT TERM

for i in "${!WORKER_IDS[@]}"; do
  name="${WORKER_NAMES[$i]}"
  wid="${WORKER_IDS[$i]}"
  dir="${WORKER_DIRS[$i]}"
  route="${WORKER_ROUTES[$i]}"
  color="$(color_for_worker "$i")"

  # Spawn: wrangler tail | node formatter
  (
    cd "$REPO_ROOT/$dir"
    npx wrangler tail "$wid" --format json 2>/dev/null
  ) | node "$FORMATTER" \
      "$name" "$color" "$C_RESET" "$C_DIM" "$C_GRAY" \
      "$C_RED" "$C_GREEN" "$C_YELLOW" \
      "$FORMAT" "$STATUS_ONLY" "$DEBUG" "$route" &

  PIDS+=($!)
done

# ─── Wait for Ctrl+C ─────────────────────────────────────────────────────────
wait
