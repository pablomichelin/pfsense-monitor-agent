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
CLIENT_COOKIE_JAR="$(mktemp)"
OTHER_CLIENT_COOKIE_JAR="$(mktemp)"
RESPONSE_BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_A_CODE="CPROF-A-$SUFFIX"
CLIENT_B_CODE="CPROF-B-$SUFFIX"
SITE_A_CODE="CPROF-SITE-A-$SUFFIX"
SITE_B_CODE="CPROF-SITE-B-$SUFFIX"
NODE_A_UID="cprof-a-$SUFFIX"
NODE_B_UID="cprof-b-$SUFFIX"
CLIENT_USER_EMAIL="client-user-$SUFFIX@systemup.inf.br"
CLIENT_USER_PASSWORD="Client!$SUFFIX"

cleanup() {
  rm -f \
    "$ADMIN_COOKIE_JAR" \
    "$CLIENT_COOKIE_JAR" \
    "$OTHER_CLIENT_COOKIE_JAR" \
    "$RESPONSE_BODY_FILE"
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

permissions_include() {
  local json="$1"
  local permission="$2"

  node -e '
const payload = JSON.parse(process.argv[1]);
const permission = process.argv[2];
process.exit((payload.permissions ?? []).includes(permission) ? 0 : 1);
' "$json" "$permission"
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

echo "[1/7] Login superadmin"
curl -skS \
  -b "$ADMIN_COOKIE_JAR" \
  -c "$ADMIN_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null

echo "[2/7] Criando inventario em dois clientes"
read -r CLIENT_A_ID NODE_A_ID < <(create_inventory "$CLIENT_A_CODE" "$SITE_A_CODE" "$NODE_A_UID" "Client Profile A $SUFFIX")
read -r CLIENT_B_ID NODE_B_ID < <(create_inventory "$CLIENT_B_CODE" "$SITE_B_CODE" "$NODE_B_UID" "Client Profile B $SUFFIX")

echo "[3/7] Criando usuario perfil client vinculado ao cliente A"
CREATE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$CLIENT_USER_EMAIL\",\"display_name\":\"Client User $SUFFIX\",\"password\":\"$CLIENT_USER_PASSWORD\",\"role\":\"client\",\"status\":\"active\",\"client_id\":\"$CLIENT_A_ID\"}")"
[[ "$(json_get "$CREATE_RESPONSE" "user.role")" == "client" ]]

echo "[4/7] Login perfil client"
CLIENT_LOGIN="$(curl -skS \
  -b "$CLIENT_COOKIE_JAR" \
  -c "$CLIENT_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$CLIENT_USER_EMAIL\",\"password\":\"$CLIENT_USER_PASSWORD\"}")"
[[ "$(json_get "$CLIENT_LOGIN" "user.role")" == "client" ]]

CLIENT_ME="$(request_json "$CLIENT_COOKIE_JAR" GET /api/v1/auth/me)"
permissions_include "$CLIENT_ME" "firewalls.view"
permissions_include "$CLIENT_ME" "backups.view"
! permissions_include "$CLIENT_ME" "alerts.view"
! permissions_include "$CLIENT_ME" "backups.download"
! permissions_include "$CLIENT_ME" "clients.create"

echo "[5/7] Validando visibilidade restrita ao cliente A"
NODES_RESPONSE="$(request_json "$CLIENT_COOKIE_JAR" GET /api/v1/nodes)"
NODE_IDS="$(node -e '
const payload = JSON.parse(process.argv[1]);
process.stdout.write((payload.items ?? []).map((item) => item.id).join(","));
' "$NODES_RESPONSE")"
echo "$NODE_IDS" | tr ',' '\n' | grep -Fxq "$NODE_A_ID"
! echo "$NODE_IDS" | tr ',' '\n' | grep -Fxq "$NODE_B_ID"

echo "[6/7] Validando bloqueios administrativos e alertas internos"
[[ "$(request_with_status "$CLIENT_COOKIE_JAR" GET /api/v1/alerts)" == "403" ]]
[[ "$(request_with_status "$CLIENT_COOKIE_JAR" GET /api/v1/admin/audit)" == "403" ]]
[[ "$(request_with_status "$CLIENT_COOKIE_JAR" GET "/api/v1/nodes/$NODE_B_ID")" == "403" ]]
[[ "$(request_with_status "$CLIENT_COOKIE_JAR" POST "/api/v1/nodes/$NODE_A_ID/config-backups/request")" == "403" ]]

echo "[7/7] Validando paginas do painel"
[[ "$(curl -skS -b "$CLIENT_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/dashboard")" == "200" ]]
[[ "$(curl -skS -b "$CLIENT_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/nodes/$NODE_A_ID")" == "200" ]]
[[ "$(curl -skS -b "$CLIENT_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/alerts")" == "307" || "$(curl -skS -b "$CLIENT_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/alerts")" == "200" ]]

echo "Smoke RBAC client profile OK: perfil client ve apenas sua empresa e rotas internas bloqueadas."
