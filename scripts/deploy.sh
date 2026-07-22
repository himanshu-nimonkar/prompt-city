#!/usr/bin/env bash
# Deploy Prompt City:
#   1) model-advisor Worker (API + Workers AI + D1)
#   2) prompt-city static frontend (Workers Assets)
#
# Prereqs (one-time):
#   cd model-advisor && npx wrangler login
#   cd model-advisor && npx wrangler secret put CF_AI_TOKEN
#   cd model-advisor && npm run db:remote
#
# Usage:
#   ./scripts/deploy.sh
#   API_BASE=https://model-advisor.<subdomain>.workers.dev ./scripts/deploy.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking auth"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: cd model-advisor && npx wrangler login"
  exit 1
fi

echo "==> Deploying model-advisor API"
(
  cd model-advisor
  npx wrangler deploy
)

API_BASE="${API_BASE:-}"
if [[ -z "$API_BASE" ]]; then
  # Best-effort: read workers.dev host from last deploy output is hard; default pattern.
  SUB=$(npx wrangler whoami 2>/dev/null | sed -n 's/.*workers\.dev subdomain: *//p' | head -1 | tr -d '[:space:]' || true)
  if [[ -n "$SUB" ]]; then
    API_BASE="https://model-advisor.${SUB}.workers.dev"
  else
    API_BASE="https://model-advisor.workers.dev"
    echo "WARN: could not detect workers.dev subdomain; set API_BASE explicitly if health check fails"
  fi
fi

echo "==> API base: $API_BASE"
echo "==> Health check"
if curl -fsS "$API_BASE/health" >/dev/null; then
  echo "API healthy"
else
  echo "WARN: health check failed for $API_BASE — frontend will still deploy with this base"
fi

echo "==> Building frontend with VITE_API_BASE=$API_BASE"
VITE_API_BASE="$API_BASE" npm run build

echo "==> Deploying prompt-city frontend"
npx wrangler deploy

echo ""
echo "Done."
echo "  API:  $API_BASE"
echo "  Web:  https://prompt-city.<your-subdomain>.workers.dev"
echo "Open the workers.dev URL printed by wrangler above."
