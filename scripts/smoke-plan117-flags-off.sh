#!/usr/bin/env bash

# Smoke plano 117: valida comportamento fail-safe com feature flags default OFF.
# API-first. Requer stack local com flags default (sem METRIC_ROLLUPS_ENABLED etc.).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"
  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL 2>/dev/null || true)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD 2>/dev/null || true)}"

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes." >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$RESPONSE_FILE"; }
trap cleanup EXIT

json_get() {
  node -e '
const payload = JSON.parse(process.argv[1]);
const expression = process.argv[2].split(".");
let current = payload;
for (const part of expression) {
  if (/^\d+$/.test(part)) current = current?.[Number(part)];
  else current = current?.[part];
}
if (current === undefined || current === null) process.exit(1);
if (typeof current === "object") process.stdout.write(JSON.stringify(current));
else process.stdout.write(String(current));
' "$1" "$2"
}

request_json() {
  local method="$1" path="$2" body="${3:-}"
  local csrf_header=()
  if [[ "$method" != "GET" ]]; then
    local csrf_token
    csrf_token="$(awk '$6=="monitor_pfsense_csrf"{print $7}' "$COOKIE_JAR")"
    [[ -n "$csrf_token" ]] && csrf_header=(-H "x-csrf-token: $csrf_token")
  fi
  if [[ -n "$body" ]]; then
    curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" "${csrf_header[@]}" -X "$method" "$BASE_URL$path" --data "$body"
  else
    curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" "${csrf_header[@]}" -X "$method" "$BASE_URL$path"
  fi
}

expect_http() {
  local method="$1" path="$2" expected="$3" body="${4:-}"
  local status
  if [[ -n "$body" ]]; then
    status="$(curl -skS -o "$RESPONSE_FILE" -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "content-type: application/json" -X "$method" "$BASE_URL$path" --data "$body")"
  else
    status="$(curl -skS -o "$RESPONSE_FILE" -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "content-type: application/json" -X "$method" "$BASE_URL$path")"
  fi
  if [[ "$status" != "$expected" ]]; then
    echo "Esperado HTTP $expected em $path, recebeu $status" >&2
    cat "$RESPONSE_FILE" >&2
    exit 1
  fi
  cat "$RESPONSE_FILE"
}

echo "[1/6] Login bootstrap"
curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null

echo "[2/6] GET /api/v1/notifications/status — dispatcher off"
NOTIF_STATUS="$(request_json GET /api/v1/notifications/status)"
NOTIF_ENABLED="$(json_get "$NOTIF_STATUS" "enabled")"
if [[ "$NOTIF_ENABLED" != "false" ]]; then
  echo "NOTIFICATIONS_ENABLED deveria ser false no ambiente default (enabled=$NOTIF_ENABLED)" >&2
  exit 1
fi

echo "[3/6] GET /api/v1/node-capabilities/status — vault/capabilities off"
CAP_STATUS="$(request_json GET /api/v1/node-capabilities/status)"
CAP_ENABLED="$(json_get "$CAP_STATUS" "enabled")"
if [[ "$CAP_ENABLED" != "false" ]]; then
  echo "NODE_CAPABILITIES_ENABLED deveria ser false (enabled=$CAP_ENABLED)" >&2
  exit 1
fi

echo "[4/6] GET /api/v1/dashboard/fleet — dashboard frota (sempre on)"
FLEET="$(request_json GET /api/v1/dashboard/fleet)"
json_get "$FLEET" "totals.nodes" >/dev/null

echo "[5/6] Resolver node para endpoints por firewall"
NODES="$(request_json GET /api/v1/nodes)"
NODE_ID="$(node -e '
const payload = JSON.parse(process.argv[1]);
const nodes = payload.items || payload.nodes || [];
const first = Array.isArray(nodes) ? nodes[0] : null;
if (!first?.id) process.exit(1);
process.stdout.write(first.id);
' "$NODES" 2>/dev/null || true)"

if [[ -z "${NODE_ID:-}" ]]; then
  SUFFIX="$(date +%s)"
  CLIENT_ID="$(json_get "$(request_json POST /api/v1/admin/clients "{\"name\":\"Plan117 Smoke $SUFFIX\",\"code\":\"P117-$SUFFIX\"}")" "client.id")"
  SITE_ID="$(json_get "$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Plan117 Site\",\"code\":\"P117-S-$SUFFIX\"}")" "site.id")"
  NODE_UID="plan117-$SUFFIX"
  NODE_ID="$(json_get "$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"Plan117 Smoke $SUFFIX\"}")" "node.id")"
fi

echo "[6/6] Endpoints por node — rollups e pfREST off"
HISTORY="$(request_json "GET" "/api/v1/nodes/$NODE_ID/metrics/history?period=24h")"
HIST_ENABLED="$(json_get "$HISTORY" "enabled")"
if [[ "$HIST_ENABLED" != "false" ]]; then
  echo "METRIC_ROLLUPS_ENABLED deveria ser false (enabled=$HIST_ENABLED)" >&2
  exit 1
fi

PFREST_STATUS="$(request_json GET "/api/v1/nodes/$NODE_ID/pfsense-api/status")"
PFREST_ENABLED="$(json_get "$PFREST_STATUS" "enabled")"
if [[ "$PFREST_ENABLED" != "false" ]]; then
  echo "PFSENSE_API_ENABLED deveria ser false (enabled=$PFREST_ENABLED)" >&2
  exit 1
fi

expect_http GET "/api/v1/nodes/$NODE_ID/pfsense-api/aliases" 403 >/dev/null

echo "Smoke plano 117 (flags off) OK."
