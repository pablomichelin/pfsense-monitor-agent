#!/usr/bin/env bash
# Smoke: endpoints e RBAC do upgrade remoto pfSense OS

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

read_env_value() {
  local key="$1"
  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$ROOT_DIR/.env.api" 2>/dev/null || true
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD)}"

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes" >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$BODY"' EXIT

login() {
  curl -fsS -c "$COOKIE_JAR" -X POST "$BASE_URL/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null
}

csrf_token() {
  awk '$6 == "monitor_pfsense_csrf" { print $7; exit }' "$COOKIE_JAR"
}

NODE_ID="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/v1/nodes?limit=1" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["items"][0]["id"] if d.get("items") else "")')"

if [[ -z "$NODE_ID" ]]; then
  echo "Nenhum node encontrado para smoke" >&2
  exit 1
fi

login

STATUS_CODE="$(curl -sS -o "$BODY" -w '%{http_code}' -b "$COOKIE_JAR" \
  "$BASE_URL/api/v1/nodes/$NODE_ID/pfsense-upgrade/status")"

if [[ "$STATUS_CODE" != "200" ]]; then
  echo "GET status falhou: HTTP $STATUS_CODE" >&2
  cat "$BODY" >&2
  exit 1
fi

python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert "backup_gate" in d; assert "enabled" in d' "$BODY"

CSRF="$(csrf_token)"
REQUEST_CODE="$(curl -sS -o "$BODY" -w '%{http_code}' -b "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/v1/nodes/$NODE_ID/pfsense-upgrade/request" \
  -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' \
  -d '{"enable_maintenance_mode":true}')"

# Com feature flag off (default), esperamos 503
if [[ "$REQUEST_CODE" != "503" && "$REQUEST_CODE" != "409" && "$REQUEST_CODE" != "403" ]]; then
  echo "POST request status inesperado: HTTP $REQUEST_CODE" >&2
  cat "$BODY" >&2
  exit 1
fi

echo "smoke-pfsense-upgrade-command: OK (node=$NODE_ID status=$STATUS_CODE request=$REQUEST_CODE)"
