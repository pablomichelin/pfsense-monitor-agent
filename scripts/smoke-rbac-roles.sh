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
BODY_FILE="$(mktemp)"
RESPONSE_BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="RBAC-$SUFFIX"
SITE_CODE="RBAC-SITE-$SUFFIX"
NODE_UID="rbac-fw-$SUFFIX"
OPERATOR_EMAIL="operator-$SUFFIX@systemup.inf.br"
READONLY_EMAIL="readonly-$SUFFIX@systemup.inf.br"
OPERATOR_PASSWORD="Operator!$SUFFIX"
READONLY_PASSWORD="Readonly!$SUFFIX"

cleanup() {
  rm -f \
    "$ADMIN_COOKIE_JAR" \
    "$OPERATOR_COOKIE_JAR" \
    "$READONLY_COOKIE_JAR" \
    "$BODY_FILE" \
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

build_heartbeat_signature() {
  local timestamp="$1"
  local body_path="$2"
  local secret="$3"

  node -e '
const fs = require("fs");
const crypto = require("crypto");
const timestamp = process.argv[1];
const bodyPath = process.argv[2];
const secret = process.argv[3];
const body = fs.readFileSync(bodyPath);
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n"), body]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$timestamp" "$body_path" "$secret"
}

echo "[1/7] Login bootstrap admin"
LOGIN_RESPONSE="$(curl -skS \
  -b "$ADMIN_COOKIE_JAR" \
  -c "$ADMIN_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/7] Criando inventario minimo e alerta de teste"
CLIENT_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/clients "{\"name\":\"RBAC Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"
SITE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"RBAC Site $SUFFIX\",\"code\":\"$SITE_CODE\",\"city\":\"Sao Paulo\",\"state\":\"SP\",\"timezone\":\"America/Sao_Paulo\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"
NODE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"RBAC Firewall $SUFFIX\",\"management_ip\":\"10.240.0.1\",\"wan_ip\":\"198.51.100.90\",\"pfsense_version\":\"2.8.1\",\"agent_version\":\"0.1.1\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

cat > "$BODY_FILE" <<JSON
{
  "schema_version": "2026-01",
  "heartbeat_id": "hb-rbac-$SUFFIX",
  "sent_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node_uid": "$NODE_UID",
  "site_name": "RBAC Site $SUFFIX",
  "hostname": "$NODE_UID.local",
  "customer_code": "$CLIENT_CODE",
  "mgmt_ip": "10.240.0.1",
  "wan_ip_reported": "198.51.100.90",
  "pfsense_version": "2.8.1",
  "agent_version": "0.1.1",
  "uptime_sec": 12345,
  "cpu_percent": 20.5,
  "memory_percent": 44.1,
  "disk_percent": 52.3,
  "gateways": [
    { "name": "WAN_DHCP", "status": "online", "latency_ms": 12, "loss_percent": 0 }
  ],
  "services": [
    { "name": "unbound", "status": "running" },
    { "name": "openvpn", "status": "stopped", "message": "rbac smoke failure" }
  ],
  "notices": []
}
JSON

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HEARTBEAT_SIGNATURE="$(build_heartbeat_signature "$TIMESTAMP" "$BODY_FILE" "$NODE_SECRET")"
HEARTBEAT_RESPONSE="$(curl -skS \
  -H "content-type: application/json" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$HEARTBEAT_SIGNATURE" \
  --data-binary "@$BODY_FILE" \
  "$BASE_URL/api/v1/ingest/heartbeat")"
[[ "$(json_get "$HEARTBEAT_RESPONSE" "node_status")" == "degraded" ]]

ALERTS_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" GET "/api/v1/alerts?node_id=$NODE_ID&status=open")"
ALERT_ID="$(json_get "$ALERTS_RESPONSE" "items.0.id")"

echo "[3/7] Criando usuarios operator e readonly"
OPERATOR_CREATE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$OPERATOR_EMAIL\",\"display_name\":\"RBAC Operator $SUFFIX\",\"password\":\"$OPERATOR_PASSWORD\",\"role\":\"operator\",\"status\":\"active\"}")"
READONLY_CREATE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$READONLY_EMAIL\",\"display_name\":\"RBAC Readonly $SUFFIX\",\"password\":\"$READONLY_PASSWORD\",\"role\":\"readonly\",\"status\":\"active\"}")"
[[ "$(json_get "$OPERATOR_CREATE_RESPONSE" "user.role")" == "operator" ]]
[[ "$(json_get "$READONLY_CREATE_RESPONSE" "user.role")" == "readonly" ]]

echo "[4/7] Login operator e readonly"
OPERATOR_LOGIN_RESPONSE="$(curl -skS \
  -b "$OPERATOR_COOKIE_JAR" \
  -c "$OPERATOR_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$OPERATOR_EMAIL\",\"password\":\"$OPERATOR_PASSWORD\"}")"
READONLY_LOGIN_RESPONSE="$(curl -skS \
  -b "$READONLY_COOKIE_JAR" \
  -c "$READONLY_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$READONLY_EMAIL\",\"password\":\"$READONLY_PASSWORD\"}")"
[[ "$(json_get "$OPERATOR_LOGIN_RESPONSE" "user.role")" == "operator" ]]
[[ "$(json_get "$READONLY_LOGIN_RESPONSE" "user.role")" == "readonly" ]]

echo "[5/7] Validando leitura para operator e readonly"
[[ "$(json_get "$(request_json "$OPERATOR_COOKIE_JAR" GET /api/v1/dashboard/summary)" "totals.nodes" || true)" != "" ]]
[[ "$(json_get "$(request_json "$READONLY_COOKIE_JAR" GET /api/v1/dashboard/summary)" "totals.nodes" || true)" != "" ]]
[[ "$(json_get "$(request_json "$OPERATOR_COOKIE_JAR" GET /api/v1/nodes)" "items.0.id" || true)" != "" ]]
[[ "$(json_get "$(request_json "$READONLY_COOKIE_JAR" GET /api/v1/nodes)" "items.0.id" || true)" != "" ]]
[[ "$(json_get "$(request_json "$OPERATOR_COOKIE_JAR" GET "/api/v1/alerts?node_id=$NODE_ID&status=open")" "items.0.id")" == "$ALERT_ID" ]]
[[ "$(json_get "$(request_json "$READONLY_COOKIE_JAR" GET "/api/v1/alerts?node_id=$NODE_ID&status=open")" "items.0.id")" == "$ALERT_ID" ]]

echo "[6/7] Validando bloqueios e permissoes de escrita"
[[ "$(request_with_status "$OPERATOR_COOKIE_JAR" GET /api/v1/admin/users)" == "403" ]]
[[ "$(request_with_status "$READONLY_COOKIE_JAR" GET /api/v1/admin/users)" == "403" ]]
[[ "$(request_with_status "$OPERATOR_COOKIE_JAR" GET /api/v1/admin/audit)" == "403" ]]
[[ "$(request_with_status "$READONLY_COOKIE_JAR" GET /api/v1/admin/audit)" == "403" ]]
[[ "$(request_with_status "$READONLY_COOKIE_JAR" POST "/api/v1/alerts/$ALERT_ID/acknowledge")" == "403" ]]

OPERATOR_ACK_RESPONSE="$(request_json "$OPERATOR_COOKIE_JAR" POST "/api/v1/alerts/$ALERT_ID/acknowledge")"
[[ "$(json_get "$OPERATOR_ACK_RESPONSE" "status")" == "acknowledged" ]]
OPERATOR_RESOLVE_RESPONSE="$(request_json "$OPERATOR_COOKIE_JAR" POST "/api/v1/alerts/$ALERT_ID/resolve" '{"resolution_note":"operator resolved"}')"
[[ "$(json_get "$OPERATOR_RESOLVE_RESPONSE" "status")" == "resolved" ]]

echo "[7/7] Validando que readonly continua sem mutacao administrativa"
[[ "$(request_with_status "$READONLY_COOKIE_JAR" POST "/api/v1/admin/users" "{\"email\":\"deny-$SUFFIX@systemup.inf.br\",\"password\":\"Denied!$SUFFIX\",\"role\":\"readonly\"}")" == "403" ]]

echo "Smoke RBAC OK: operator e readonly validados em leitura, escrita de alertas e bloqueio administrativo incluindo auditoria."
