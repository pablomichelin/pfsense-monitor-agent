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

COOKIE_JAR="$(mktemp)"
USER_COOKIE_JAR="$(mktemp)"
BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="ADM-$SUFFIX"
SITE_CODE="ADM-SITE-$SUFFIX"
NODE_UID="adm-fw-$SUFFIX"

cleanup() {
  rm -f "$COOKIE_JAR" "$USER_COOKIE_JAR" "$BODY_FILE"
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

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local csrf_header=()

  if [[ "$method" != "GET" ]]; then
    local csrf_token
    csrf_token="$(awk '$6=="monitor_pfsense_csrf"{print $7}' "$COOKIE_JAR")"
    if [[ -n "$csrf_token" ]]; then
      csrf_header=(-H "x-csrf-token: $csrf_token")
    fi
  fi

  if [[ -n "$body" ]]; then
    curl -skS \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      -H "content-type: application/json" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path" \
      --data "$body"
  else
    curl -skS \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      -H "content-type: application/json" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path"
  fi
}

build_test_signature() {
  local timestamp="$1"
  local secret="$2"

  node -e '
const crypto = require("crypto");
const timestamp = process.argv[1];
const secret = process.argv[2];
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n")]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$timestamp" "$secret"
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

echo "[1/14] Login em $BASE_URL"
LOGIN_RESPONSE="$(curl -skS \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"

json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/14] Verificando rota /admin (HTTP 200)"
ADMIN_STATUS="$(curl -skS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/admin")"
[[ "$ADMIN_STATUS" == "200" ]]

echo "[3/14] Criando client/site/node"
CLIENT_RESPONSE="$(request_json POST /api/v1/admin/clients "{\"name\":\"Admin Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"

SITE_RESPONSE="$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Admin Site $SUFFIX\",\"code\":\"$SITE_CODE\",\"city\":\"Sao Paulo\",\"state\":\"SP\",\"timezone\":\"America/Sao_Paulo\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"

NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"Admin Firewall $SUFFIX\",\"management_ip\":\"10.250.0.1\",\"wan_ip\":\"198.51.100.50\",\"pfsense_version\":\"2.8.1\",\"agent_version\":\"0.1.0\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

echo "[4/14] Atualizando client/site/node"
UPDATED_CLIENT_RESPONSE="$(request_json POST "/api/v1/admin/clients/$CLIENT_ID" "{\"name\":\"Admin Smoke Updated $SUFFIX\",\"code\":\"$CLIENT_CODE-U\",\"status\":\"active\"}")"
UPDATED_SITE_RESPONSE="$(request_json POST "/api/v1/admin/sites/$SITE_ID" "{\"name\":\"Admin Site Updated $SUFFIX\",\"code\":\"$SITE_CODE-U\",\"city\":\"Campinas\",\"state\":\"SP\",\"timezone\":\"America/Sao_Paulo\",\"status\":\"active\"}")"
UPDATED_NODE_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID" "{\"hostname\":\"$NODE_UID-updated.local\",\"display_name\":\"Admin Firewall Updated $SUFFIX\",\"management_ip\":\"10.250.0.2\",\"wan_ip\":\"198.51.100.51\",\"pfsense_version\":\"2.9.0\",\"agent_version\":\"0.1.1\",\"ha_role\":\"primary\"}")"

[[ "$(json_get "$UPDATED_CLIENT_RESPONSE" "client.code")" == "$CLIENT_CODE-U" ]]
[[ "$(json_get "$UPDATED_SITE_RESPONSE" "site.code")" == "$SITE_CODE-U" ]]
[[ "$(json_get "$UPDATED_NODE_RESPONSE" "node.management_ip")" == "10.250.0.2" ]]

echo "[5/14] Alternando maintenance mode"
MAINTENANCE_ON_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID/maintenance" '{"maintenance_mode":true}')"
[[ "$(json_get "$MAINTENANCE_ON_RESPONSE" "maintenance_mode")" == "true" ]]
MAINTENANCE_OFF_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID/maintenance" '{"maintenance_mode":false}')"
[[ "$(json_get "$MAINTENANCE_OFF_RESPONSE" "maintenance_mode")" == "false" ]]

echo "[6/14] Rotacionando secret do node"
REKEY_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID/rekey")"
NODE_SECRET="$(json_get "$REKEY_RESPONSE" "bootstrap.node_secret")"
ROTATED_AT="$(json_get "$REKEY_RESPONSE" "bootstrap.rotated_at")"
[[ -n "$ROTATED_AT" ]]

echo "[7/14] Validando test-connection com secret novo"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TEST_SIGNATURE="$(build_test_signature "$TIMESTAMP" "$NODE_SECRET")"
TEST_CONNECTION_RESPONSE="$(curl -skS \
  -X POST \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$TEST_SIGNATURE" \
  "$BASE_URL/api/v1/ingest/test-connection")"
[[ "$(json_get "$TEST_CONNECTION_RESPONSE" "message")" == "connection validated" ]]

echo "[8/14] Enviando heartbeat com servico down para abrir alerta"
cat > "$BODY_FILE" <<JSON
{
  "schema_version": "2026-01",
  "heartbeat_id": "hb-admin-$SUFFIX",
  "sent_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node_uid": "$NODE_UID",
  "site_name": "Admin Site Updated $SUFFIX",
  "hostname": "$NODE_UID-updated.local",
  "customer_code": "$CLIENT_CODE-U",
  "mgmt_ip": "10.250.0.2",
  "wan_ip_reported": "198.51.100.51",
  "pfsense_version": "2.9.0",
  "agent_version": "0.1.1",
  "uptime_sec": 43210,
  "cpu_percent": 21.1,
  "memory_percent": 55.2,
  "disk_percent": 60.3,
  "gateways": [
    { "name": "WAN_DHCP", "status": "online", "latency_ms": 10, "loss_percent": 0 }
  ],
  "services": [
    { "name": "unbound", "status": "running" },
    { "name": "openvpn", "status": "stopped", "message": "smoke failure" }
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

echo "[9/14] Lendo, reconhecendo e resolvendo alerta"
ALERTS_RESPONSE="$(request_json GET "/api/v1/alerts?node_id=$NODE_ID&status=open")"
ALERT_ID="$(json_get "$ALERTS_RESPONSE" "items.0.id")"
ALERT_TYPE="$(json_get "$ALERTS_RESPONSE" "items.0.type")"
[[ "$ALERT_TYPE" == "service_down" ]]

ACK_RESPONSE="$(request_json POST "/api/v1/alerts/$ALERT_ID/acknowledge")"
[[ "$(json_get "$ACK_RESPONSE" "status")" == "acknowledged" ]]

RESOLVE_RESPONSE="$(request_json POST "/api/v1/alerts/$ALERT_ID/resolve" '{"resolution_note":"smoke resolved"}')"
[[ "$(json_get "$RESOLVE_RESPONSE" "status")" == "resolved" ]]

echo "[10/14] Emitindo e revogando token auxiliar do agente"
TOKEN_CREATE_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID/agent-tokens" '{}')"
TOKEN_ID="$(json_get "$TOKEN_CREATE_RESPONSE" "token.id")"
TOKEN_HINT="$(json_get "$TOKEN_CREATE_RESPONSE" "token.token_hint")"
TOKEN_VALUE="$(json_get "$TOKEN_CREATE_RESPONSE" "token.agent_token")"
[[ -n "$TOKEN_ID" ]]
[[ -n "$TOKEN_HINT" ]]
[[ -n "$TOKEN_VALUE" ]]

TOKENS_LIST_RESPONSE="$(request_json GET "/api/v1/admin/nodes/$NODE_ID/agent-tokens")"
[[ "$(json_get "$TOKENS_LIST_RESPONSE" "items.0.id")" == "$TOKEN_ID" ]]

TOKEN_REVOKE_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID/agent-tokens/$TOKEN_ID/revoke")"
[[ "$(json_get "$TOKEN_REVOKE_RESPONSE" "token_id")" == "$TOKEN_ID" ]]

echo "[11/14] Criando usuario local e validando login administrativo"
USER_EMAIL="admin-smoke-$SUFFIX@systemup.inf.br"
USER_PASSWORD="AdminSmoke!$SUFFIX"
CREATE_USER_RESPONSE="$(request_json POST /api/v1/admin/users "{\"email\":\"$USER_EMAIL\",\"display_name\":\"Admin Smoke User $SUFFIX\",\"password\":\"$USER_PASSWORD\",\"role\":\"admin\",\"status\":\"active\"}")"
USER_ID="$(json_get "$CREATE_USER_RESPONSE" "user.id")"
[[ "$(json_get "$CREATE_USER_RESPONSE" "user.role")" == "admin" ]]

USER_LOGIN_RESPONSE="$(curl -skS \
  -b "$USER_COOKIE_JAR" \
  -c "$USER_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
[[ "$(json_get "$USER_LOGIN_RESPONSE" "user.role")" == "admin" ]]

USER_ME_RESPONSE="$(curl -skS -b "$USER_COOKIE_JAR" "$BASE_URL/api/v1/auth/me")"
[[ "$(json_get "$USER_ME_RESPONSE" "user.id")" == "$USER_ID" ]]

USER_ADMIN_USERS_STATUS="$(curl -skS -o /dev/null -w "%{http_code}" -b "$USER_COOKIE_JAR" "$BASE_URL/api/v1/admin/users")"
[[ "$USER_ADMIN_USERS_STATUS" == "403" ]]

echo "[12/14] Validando protecao do ultimo superadmin"
USERS_RESPONSE="$(request_json GET /api/v1/admin/users)"
BOOTSTRAP_USER_ID="$(node -e '
const payload = JSON.parse(process.argv[1]);
const authEmail = process.argv[2].toLowerCase();
const match = payload.items.find((item) => String(item.email).toLowerCase() === authEmail);
if (!match) process.exit(1);
process.stdout.write(match.id);
' "$USERS_RESPONSE" "$AUTH_EMAIL")"

LAST_SUPERADMIN_DEMOTE_RESPONSE="$(request_json POST "/api/v1/admin/users/$BOOTSTRAP_USER_ID" '{"role":"admin"}')"
[[ "$(json_get "$LAST_SUPERADMIN_DEMOTE_RESPONSE" "statusCode")" == "403" ]]

LAST_SUPERADMIN_DISABLE_RESPONSE="$(request_json POST "/api/v1/admin/users/$BOOTSTRAP_USER_ID" '{"status":"inactive"}')"
[[ "$(json_get "$LAST_SUPERADMIN_DISABLE_RESPONSE" "statusCode")" == "403" ]]

echo "[13/14] Validando inventario, filtros e auditoria atualizados"
FILTERS_RESPONSE="$(request_json GET /api/v1/nodes/filters)"
[[ "$(json_get "$FILTERS_RESPONSE" "clients.0.status" || true)" != "" ]]
NODES_RESPONSE="$(request_json GET "/api/v1/nodes?search=$NODE_UID")"
[[ "$(json_get "$NODES_RESPONSE" "items.0.id")" == "$NODE_ID" ]]
[[ "$(json_get "$NODES_RESPONSE" "items.0.pfsense_version_homologated")" == "false" ]]
DETAIL_RESPONSE="$(request_json GET "/api/v1/nodes/$NODE_ID")"
[[ "$(json_get "$DETAIL_RESPONSE" "node.pfsense_version_homologated")" == "false" ]]
DASHBOARD_RESPONSE="$(request_json GET /api/v1/dashboard/summary)"
[[ "$(json_get "$DASHBOARD_RESPONSE" "totals.versions_out_of_matrix")" != "0" ]]
AUDIT_RESPONSE="$(request_json GET "/api/v1/admin/audit?limit=20")"
[[ "$(json_get "$AUDIT_RESPONSE" "items.0.id" || true)" != "" ]]
TOKEN_AUDIT_RESPONSE="$(request_json GET "/api/v1/admin/audit?target_type=agent_token&limit=20")"
[[ "$(json_get "$TOKEN_AUDIT_RESPONSE" "items.0.target_type")" == "agent_token" ]]
AUDIT_PAGE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/audit")"
grep -q 'Auditoria humana' <<<"$AUDIT_PAGE"
grep -q 'Trilhas recentes' <<<"$AUDIT_PAGE"

echo "[14/14] Excluindo node (exclusao individual)"
DELETE_RESPONSE="$(request_json DELETE "/api/v1/admin/nodes/$NODE_ID")"
[[ "$(json_get "$DELETE_RESPONSE" "ok")" == "true" ]]
[[ "$(json_get "$DELETE_RESPONSE" "node_id")" == "$NODE_ID" ]]
[[ "$(json_get "$DELETE_RESPONSE" "node_uid")" == "$NODE_UID" ]]
NODES_AFTER_DELETE="$(request_json GET "/api/v1/nodes?search=$NODE_UID")"
DELETE_FOUND="$(node -e "
const p = JSON.parse(process.argv[1]);
const found = p.items?.some(i => i.id === process.argv[2]);
process.stdout.write(found ? '1' : '0');
" "$NODES_AFTER_DELETE" "$NODE_ID")"
[[ "$DELETE_FOUND" == "0" ]]
AUDIT_DELETE="$(request_json GET "/api/v1/admin/audit?action=admin.node.delete&limit=5")"
node -e "
const p = JSON.parse(process.argv[1]);
const uid = process.argv[2];
const match = p.items?.find(i => {
  if (i.action !== 'admin.node.delete') return false;
  const meta = i.metadata_json;
  return meta && typeof meta === 'object' && meta.node_uid === uid;
});
if (!match) process.exit(1);
" "$AUDIT_DELETE" "$NODE_UID"

echo "Smoke admin OK: rota /admin acessivel, inventario, usuarios locais, auditoria, exclusao de host, guarda do ultimo superadmin, maintenance, rekey, token auxiliar do agente, test-connection e ciclo de alertas validados."
