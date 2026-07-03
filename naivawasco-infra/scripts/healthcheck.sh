#!/usr/bin/env bash
set -euo pipefail

URL="${1:?Usage: healthcheck.sh https://app.your-domain.com}"
API_URL="${2:-$URL/api/}"

echo "Checking web: $URL"
curl -fsSIL "$URL" >/dev/null

echo "Checking API: $API_URL"
curl -fsSI "$API_URL" >/dev/null || curl -fsS "$API_URL" >/dev/null

echo "Healthcheck passed."

