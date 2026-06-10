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
OPERATOR_COOKIE_JAR="$(mktemp)"
READONLY_COOKIE_JAR="$(mktemp)"
RESPONSE_BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="PERM-$SUFFIX"
SITE_CODE="PERM-SITE-$SUFFIX"
NODE_UID="perm-fw-$SUFFIX"
OPERATOR_EMAIL="perm-operator-$SUFFIX@systemup.inf.br"
READONLY_EMAIL="perm-readonly-$SUFFIX@systemup.inf.br"
OPERATOR_PASSWORD="Operator!$SUFFIX"
READONLY_PASSWORD="Readonly!$SUFFIX"

cleanup() {
  rm -f \
    "$ADMIN_COOKIE_JAR" \
    "$OPERATOR_COOKIE_JAR" \
    "$READONLY_COOKIE_JAR" \
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

echo "[1/7] Login bootstrap superadmin"
LOGIN_RESPONSE="$(curl -skS \
  -b "$ADMIN_COOKIE_JAR" \
  -c "$ADMIN_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/7] Validando permissoes em /auth/me"
ME_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" GET /api/v1/auth/me)"
permissions_include "$ME_RESPONSE" "backups.download"
permissions_include "$ME_RESPONSE" "users.view"
permissions_include "$ME_RESPONSE" "firewalls.view"

echo "[3/7] Criando inventario minimo"
CLIENT_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/clients "{\"name\":\"Perm Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"
SITE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Perm Site $SUFFIX\",\"code\":\"$SITE_CODE\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"
NODE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"Perm Firewall $SUFFIX\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"

echo "[4/7] Criando operator e readonly com escopo"
request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$OPERATOR_EMAIL\",\"display_name\":\"Perm Operator\",\"password\":\"$OPERATOR_PASSWORD\",\"role\":\"operator\",\"status\":\"active\",\"client_ids\":[\"$CLIENT_ID\"]}" >/dev/null
request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$READONLY_EMAIL\",\"display_name\":\"Perm Readonly\",\"password\":\"$READONLY_PASSWORD\",\"role\":\"readonly\",\"status\":\"active\",\"client_ids\":[\"$CLIENT_ID\"]}" >/dev/null

echo "[5/7] Login operator e readonly"
curl -skS \
  -b "$OPERATOR_COOKIE_JAR" \
  -c "$OPERATOR_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$OPERATOR_EMAIL\",\"password\":\"$OPERATOR_PASSWORD\"}" >/dev/null
curl -skS \
  -b "$READONLY_COOKIE_JAR" \
  -c "$READONLY_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$READONLY_EMAIL\",\"password\":\"$READONLY_PASSWORD\"}" >/dev/null

OPERATOR_ME="$(request_json "$OPERATOR_COOKIE_JAR" GET /api/v1/auth/me)"
READONLY_ME="$(request_json "$READONLY_COOKIE_JAR" GET /api/v1/auth/me)"
permissions_include "$OPERATOR_ME" "alerts.acknowledge"
permissions_include "$OPERATOR_ME" "firewalls.view"
! permissions_include "$OPERATOR_ME" "backups.download"
! permissions_include "$OPERATOR_ME" "users.view"
permissions_include "$READONLY_ME" "alerts.view"
! permissions_include "$READONLY_ME" "alerts.acknowledge"
! permissions_include "$READONLY_ME" "backups.run"

echo "[6/7] Validando bloqueios por permissao"
[[ "$(request_with_status "$OPERATOR_COOKIE_JAR" POST "/api/v1/nodes/$NODE_ID/config-backups/request")" == "403" ]]
[[ "$(request_with_status "$READONLY_COOKIE_JAR" POST "/api/v1/admin/clients" "{\"name\":\"Denied\",\"code\":\"DENY-$SUFFIX\"}")" == "403" ]]

echo "[7/7] Validando leitura operacional preservada"
[[ "$(json_get "$(request_json "$OPERATOR_COOKIE_JAR" GET /api/v1/nodes)" "items.0.id" || true)" != "" ]]
[[ "$(json_get "$(request_json "$READONLY_COOKIE_JAR" GET /api/v1/nodes)" "items.0.id" || true)" != "" ]]
ADMIN_BACKUP_STATUS="$(request_with_status "$ADMIN_COOKIE_JAR" POST "/api/v1/nodes/$NODE_ID/config-backups/request")"
[[ "$ADMIN_BACKUP_STATUS" == "200" || "$ADMIN_BACKUP_STATUS" == "201" || "$ADMIN_BACKUP_STATUS" == "409" ]]

echo "Smoke RBAC permissions OK: /auth/me expoe permissoes e bloqueios granulares validados."
