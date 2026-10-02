#!/usr/bin/env bash
# scripts/setup-git-filters.sh — Configure local Git clean/smudge filters and safety pre-commit hook.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Configuring local Git filters for Cloudflare credentials..."
git config --local filter.cloudflare-creds.clean "scripts/git-filters/clean-cloudflare.sh"
git config --local filter.cloudflare-creds.smudge "scripts/git-filters/smudge-cloudflare.sh"

# Install pre-commit safety check
HOOK_DIR="$REPO_ROOT/.git/hooks"
mkdir -p "$HOOK_DIR"
cat <<'EOF' > "$HOOK_DIR/pre-commit"
#!/usr/bin/env bash
# Pre-commit safety barrier: verify no live Cloudflare IDs are staged in the commit
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

ACCOUNT_ID=""
DATABASE_ID=""
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  ACCOUNT_ID=$(grep -E '^[[:space:]]*CLOUDFLARE_ACCOUNT_ID=' "$REPO_ROOT/.env.local" | head -n1 | cut -d '=' -f2- | tr -d '"'\'' ')
  DATABASE_ID=$(grep -E '^[[:space:]]*CLOUDFLARE_DATABASE_ID=' "$REPO_ROOT/.env.local" | head -n1 | cut -d '=' -f2- | tr -d '"'\'' ')
fi

CHECK_PATTERNS=()
[[ -n "$ACCOUNT_ID" ]] && CHECK_PATTERNS+=("$ACCOUNT_ID")
[[ -n "$DATABASE_ID" ]] && CHECK_PATTERNS+=("$DATABASE_ID")

for pattern in "${CHECK_PATTERNS[@]}"; do
  # Check if pattern is present in any staged file
  if git grep --cached -q "$pattern" -- "apps/*/wrangler.jsonc" "scripts/*"; then
    echo ""
    echo "❌ SECURITY CHECK FAILED: Live Cloudflare credential detected in staged files!"
    echo "   Matched pattern in: $(git grep --cached -l "$pattern" -- "apps/*/wrangler.jsonc" "scripts/*")"
    echo "   Pattern: $pattern"
    echo "   Please sanitize your commit or run: aube run setup:git-filters"
    echo ""
    exit 1
  fi
done
EOF
chmod +x "$HOOK_DIR/pre-commit"

echo "✓ Local Git filters and pre-commit safety barrier configured successfully."
