#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL 2>/dev/null || true)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD 2>/dev/null || true)}"

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes. Defina no ambiente ou em .env.api." >&2
  exit 1
fi

ADMIN_COOKIE_JAR="$(mktemp)"
SCOPED_COOKIE_JAR="$(mktemp)"
RESPONSE_BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_A_CODE="SCOPE-A-$SUFFIX"
CLIENT_B_CODE="SCOPE-B-$SUFFIX"
SITE_A_CODE="SCOPE-SITE-A-$SUFFIX"
SITE_B_CODE="SCOPE-SITE-B-$SUFFIX"
NODE_A_UID="scope-a-$SUFFIX"
NODE_B_UID="scope-b-$SUFFIX"
SCOPED_ADMIN_EMAIL="scoped-admin-$SUFFIX@systemup.inf.br"
SCOPED_ADMIN_PASSWORD="Scoped!$SUFFIX"

cleanup() {
  rm -f "$ADMIN_COOKIE_JAR" "$SCOPED_COOKIE_JAR" "$RESPONSE_BODY_FILE"
}

trap cleanup EXIT

json_get() {
  local json="$1"
  local expression="$2"

  node -e '
const payload = JSON.parse(process.argv[1]);
const expression = process.argv[2].split(".");
let current = payload;
for (const part of expression) {
  if (/^\d+$/.test(part)) {
    current = current?.[Number(part)];
  } else {
    current = current?.[part];
  }
}
if (current === undefined || current === null) {
  process.exit(1);
}
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else {
  process.stdout.write(String(current));
}
' "$json" "$expression"
}

request_with_status() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local csrf_header=()

  if [[ "$method" != "GET" ]]; then
    local csrf_token
    csrf_token="$(awk '$6=="monitor_pfsense_csrf"{print $7}' "$cookie_jar")"
    if [[ -n "$csrf_token" ]]; then
      csrf_header=(-H "x-csrf-token: $csrf_token")
    fi
  fi

  if [[ -n "$body" ]]; then
    curl -skS \
      -o "$RESPONSE_BODY_FILE" \
      -w "%{http_code}" \
      -b "$cookie_jar" \
      -c "$cookie_jar" \
      -H "content-type: application/json" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path" \
      --data "$body"
  else
    curl -skS \
      -o "$RESPONSE_BODY_FILE" \
      -w "%{http_code}" \
      -b "$cookie_jar" \
      -c "$cookie_jar" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path"
  fi
}

request_json() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local status

  status="$(request_with_status "$cookie_jar" "$method" "$path" "$body")"
  cat "$RESPONSE_BODY_FILE"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    return 1
  fi
}

create_inventory() {
  local client_code="$1"
  local site_code="$2"
  local node_uid="$3"
  local label="$4"

  local client_response site_response node_response
  client_response="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/clients "{\"name\":\"$label\",\"code\":\"$client_code\"}")"
  local client_id site_id node_id
  client_id="$(json_get "$client_response" "client.id")"

  site_response="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/sites "{\"client_id\":\"$client_id\",\"name\":\"$label Site\",\"code\":\"$site_code\"}")"
  site_id="$(json_get "$site_response" "site.id")"

  node_response="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/nodes "{\"site_id\":\"$site_id\",\"node_uid\":\"$node_uid\",\"hostname\":\"$node_uid.local\",\"display_name\":\"$label Node\"}")"
  node_id="$(json_get "$node_response" "node.id")"

  printf '%s %s\n' "$client_id" "$node_id"
}

echo "[1/6] Login bootstrap admin"
LOGIN_RESPONSE="$(curl -skS \
  -b "$ADMIN_COOKIE_JAR" \
  -c "$ADMIN_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/6] Criando inventario em dois clientes"
read -r CLIENT_A_ID NODE_A_ID < <(create_inventory "$CLIENT_A_CODE" "$SITE_A_CODE" "$NODE_A_UID" "Scope A $SUFFIX")
read -r CLIENT_B_ID NODE_B_ID < <(create_inventory "$CLIENT_B_CODE" "$SITE_B_CODE" "$NODE_B_UID" "Scope B $SUFFIX")

echo "[3/6] Criando admin com escopo apenas no cliente A"
SCOPED_CREATE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$SCOPED_ADMIN_EMAIL\",\"display_name\":\"Scoped Admin $SUFFIX\",\"password\":\"$SCOPED_ADMIN_PASSWORD\",\"role\":\"admin\",\"status\":\"active\",\"client_ids\":[\"$CLIENT_A_ID\"]}")"
SCOPED_USER_ID="$(json_get "$SCOPED_CREATE_RESPONSE" "user.id")"
SCOPES_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" GET "/api/v1/admin/users/$SCOPED_USER_ID/client-scopes")"
[[ "$(json_get "$SCOPES_RESPONSE" "client_ids.0")" == "$CLIENT_A_ID" ]]

echo "[4/6] Login do admin com escopo restrito"
SCOPED_LOGIN_RESPONSE="$(curl -skS \
  -b "$SCOPED_COOKIE_JAR" \
  -c "$SCOPED_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$SCOPED_ADMIN_EMAIL\",\"password\":\"$SCOPED_ADMIN_PASSWORD\"}")"
[[ "$(json_get "$SCOPED_LOGIN_RESPONSE" "user.role")" == "admin" ]]

echo "[5/6] Validando visibilidade filtrada"
NODES_RESPONSE="$(request_json "$SCOPED_COOKIE_JAR" GET /api/v1/nodes)"
NODE_IDS="$(node -e '
const payload = JSON.parse(process.argv[1]);
const ids = (payload.items ?? []).map((item) => item.id);
process.stdout.write(ids.join(","));
' "$NODES_RESPONSE")"
echo "$NODE_IDS" | tr ',' '\n' | grep -Fxq "$NODE_A_ID"
! echo "$NODE_IDS" | tr ',' '\n' | grep -Fxq "$NODE_B_ID"

FILTERS_RESPONSE="$(request_json "$SCOPED_COOKIE_JAR" GET /api/v1/nodes/filters)"
FILTER_CLIENT_IDS="$(node -e '
const payload = JSON.parse(process.argv[1]);
const ids = (payload.clients ?? []).map((item) => item.id);
process.stdout.write(ids.join(","));
' "$FILTERS_RESPONSE")"
echo "$FILTER_CLIENT_IDS" | tr ',' '\n' | grep -Fxq "$CLIENT_A_ID"
! echo "$FILTER_CLIENT_IDS" | tr ',' '\n' | grep -Fxq "$CLIENT_B_ID"

DETAIL_A="$(request_json "$SCOPED_COOKIE_JAR" GET "/api/v1/nodes/$NODE_A_ID")"
[[ "$(json_get "$DETAIL_A" "node.id")" == "$NODE_A_ID" ]]

echo "[6/6] Validando bloqueio IDOR (403) no cliente B"
[[ "$(request_with_status "$SCOPED_COOKIE_JAR" GET "/api/v1/nodes/$NODE_B_ID")" == "403" ]]
[[ "$(request_with_status "$SCOPED_COOKIE_JAR" POST "/api/v1/admin/clients/$CLIENT_B_ID" "{\"name\":\"Denied\"}")" == "403" ]]
[[ "$(request_with_status "$SCOPED_COOKIE_JAR" GET "/api/v1/admin/nodes/$NODE_B_ID/bootstrap-command")" == "403" ]]

# C4: admin escopado NAO pode criar cliente (createClient exige escopo global).
echo "[C4] Validando bloqueio (403) de POST /admin/clients para admin escopado"
[[ "$(request_with_status "$SCOPED_COOKIE_JAR" POST "/api/v1/admin/clients" "{\"name\":\"Should Be Denied $SUFFIX\",\"code\":\"deny-$SUFFIX\"}")" == "403" ]]

echo "Smoke RBAC client scope OK: admin restrito ve apenas cliente A, recebe 403 no cliente B e nao cria clientes (C4)."
