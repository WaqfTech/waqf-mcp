#!/usr/bin/env bash
# scripts/dev.sh — Run Waqf MCP Federation Gateway (API) & Landing Page (Web) locally in parallel.
#
# Starts both services concurrently with clean log prefixes and graceful Ctrl+C termination:
#   - API (Cloudflare Worker): http://localhost:8787  (MCP endpoint: http://localhost:8787/mcp)
#   - Web (Astro multi-lingual): http://localhost:4321
#
# Usage:
#   bash scripts/dev.sh              # start both API and Web
#   bash scripts/dev.sh api          # start only the API worker
#   bash scripts/dev.sh web          # start only the Astro web landing page
#   bash scripts/dev.sh --list       # show ports and endpoints
#   bash scripts/dev.sh --help       # show this help
#
# Environment Overrides:
#   WAQF_API_PORT=8787
#   WAQF_WEB_PORT=4321

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ─── Colors ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  RED=$'\033[0;31m'
  CYAN=$'\033[0;36m'
  RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; RESET=""
fi

API_PORT="${WAQF_API_PORT:-8787}"
WEB_PORT="${WAQF_WEB_PORT:-4321}"

declare -a PIDS=()

# ─── Port Freeing Helper ─────────────────────────────────────────────────────
stop_port() {
  local port="$1"
  if [[ -z "$port" ]]; then return; fi

  if command -v lsof &>/dev/null; then
    local pids
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      kill $pids 2>/dev/null || true
    fi
  elif command -v fuser &>/dev/null; then
    fuser "${port}/tcp" -k 2>/dev/null || true
  fi
}

cleanup() {
  if [[ ${#PIDS[@]} -eq 0 ]]; then
    exit 0
  fi
  echo ""
  printf "  ${YELLOW}⚠${RESET}  Shutting down dev servers...\n"
  for pid in "${PIDS[@]:-}"; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  printf "  ${GREEN}✓${RESET}  All dev servers stopped.\n"
  exit 0
}
trap cleanup EXIT INT TERM

# ─── Commands ────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--list" || "${1:-}" == "-l" ]]; then
  printf "\n  ${BOLD}Waqf MCP Local Services${RESET}\n\n"
  printf "  %-8s  http://localhost:%s  ${DIM}(MCP: http://localhost:%s/mcp)${RESET}\n" "api" "$API_PORT" "$API_PORT"
  printf "  %-8s  http://localhost:%s  ${DIM}(Landing page)${RESET}\n" "web" "$WEB_PORT"
  printf "\n  ${DIM}Override ports with WAQF_API_PORT and WAQF_WEB_PORT.${RESET}\n\n"
  exit 0
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<EOF
${BOLD}Waqf MCP Local Development Runner${RESET}

Usage:
  bash scripts/dev.sh              Start both API and Web concurrently
  bash scripts/dev.sh api          Start only the API gateway worker
  bash scripts/dev.sh web          Start only the Astro landing page
  bash scripts/dev.sh --list       List services and local ports
  bash scripts/dev.sh --help       Show this help

Ports:
  api: http://localhost:${API_PORT}  (MCP: http://localhost:${API_PORT}/mcp)
  web: http://localhost:${WEB_PORT}
EOF
  exit 0
fi

# ─── Launchers ───────────────────────────────────────────────────────────────
start_api() {
  stop_port "$API_PORT"
  printf "  ${CYAN}▶${RESET}  %-6s  ${DIM}→${RESET}  ${BOLD}http://localhost:%s${RESET}  ${DIM}(MCP gateway: http://localhost:%s/mcp)${RESET}\n" "api" "$API_PORT" "$API_PORT"
  local tag="${BOLD}${CYAN}[api:${API_PORT}]${RESET} "
  (
    cd "apps/api"
    aube run dev -- --port "$API_PORT" --ip 127.0.0.1
  ) 2>&1 | sed -u "s/^/${tag}/" &
  PIDS+=($!)
}

start_web() {
  stop_port "$WEB_PORT"
  printf "  ${GREEN}▶${RESET}  %-6s  ${DIM}→${RESET}  ${BOLD}http://localhost:%s${RESET}  ${DIM}(Multi-lingual Astro landing)${RESET}\n" "web" "$WEB_PORT"
  local tag="${BOLD}${GREEN}[web:${WEB_PORT}]${RESET} "
  (
    cd "apps/web"
    aube run dev -- --port "$WEB_PORT"
  ) 2>&1 | sed -u "s/^/${tag}/" &
  PIDS+=($!)
}

printf "\n  ${BOLD}Waqf MCP Dev Server${RESET} ${DIM}— local testing environment${RESET}\n\n"

case "${1:-all}" in
  api)
    start_api
    ;;
  web)
    start_web
    ;;
  all)
    start_api
    sleep 0.5
    start_web
    ;;
  *)
    echo "Unknown service: $1. Valid options: api, web (or omit for both)" >&2
    exit 1
    ;;
esac

printf "\n  ${GREEN}✓${RESET}  Ready. Press ${BOLD}Ctrl+C${RESET} to terminate all servers.\n\n"
wait
