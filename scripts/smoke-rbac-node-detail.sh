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
NOSCOPE_COOKIE_JAR="$(mktemp)"
RESPONSE_BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="RBAC-ND-$SUFFIX"
SITE_CODE="RBAC-ND-SITE-$SUFFIX"
NODE_UID="rbac-nd-fw-$SUFFIX"
OPERATOR_EMAIL="operator-nd-$SUFFIX@systemup.inf.br"
READONLY_EMAIL="readonly-nd-$SUFFIX@systemup.inf.br"
NOSCOPE_EMAIL="noscope-nd-$SUFFIX@systemup.inf.br"
OPERATOR_PASSWORD="OperatorNd!$SUFFIX"
READONLY_PASSWORD="ReadonlyNd!$SUFFIX"
NOSCOPE_PASSWORD="NoScopeNd!$SUFFIX"

cleanup() {
  rm -f \
    "$ADMIN_COOKIE_JAR" \
    "$OPERATOR_COOKIE_JAR" \
    "$READONLY_COOKIE_JAR" \
    "$NOSCOPE_COOKIE_JAR" \
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

echo "[1/7] Login bootstrap admin"
LOGIN_RESPONSE="$(curl -skS \
  -b "$ADMIN_COOKIE_JAR" \
  -c "$ADMIN_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/7] Criando firewall minimo"
CLIENT_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/clients "{\"name\":\"RBAC Node Detail $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"
SITE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"RBAC ND Site $SUFFIX\",\"code\":\"$SITE_CODE\",\"city\":\"Sao Paulo\",\"state\":\"SP\",\"timezone\":\"America/Sao_Paulo\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"
NODE_RESPONSE="$(request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"RBAC ND Firewall $SUFFIX\",\"management_ip\":\"10.240.0.2\",\"wan_ip\":\"198.51.100.91\",\"pfsense_version\":\"2.8.1\",\"agent_version\":\"0.1.1\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"

# 0.4.0 (item C4): o escopo RBAC passou a ser default-deny. Operator/readonly so
# leem um node se tiverem escopo (UserClientScope) no cliente dono do node. Por isso
# operator/readonly nascem ja escopados no cliente do firewall (client_ids), enquanto
# um terceiro ator sem escopo valida o bloqueio 403 "client out of scope".
echo "[3/7] Criando operator e readonly com escopo no cliente, e um ator sem escopo"
request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$OPERATOR_EMAIL\",\"display_name\":\"RBAC ND Operator\",\"password\":\"$OPERATOR_PASSWORD\",\"role\":\"operator\",\"status\":\"active\",\"client_ids\":[\"$CLIENT_ID\"]}" >/dev/null
request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$READONLY_EMAIL\",\"display_name\":\"RBAC ND Readonly\",\"password\":\"$READONLY_PASSWORD\",\"role\":\"readonly\",\"status\":\"active\",\"client_ids\":[\"$CLIENT_ID\"]}" >/dev/null
request_json "$ADMIN_COOKIE_JAR" POST /api/v1/admin/users "{\"email\":\"$NOSCOPE_EMAIL\",\"display_name\":\"RBAC ND NoScope\",\"password\":\"$NOSCOPE_PASSWORD\",\"role\":\"readonly\",\"status\":\"active\"}" >/dev/null

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

curl -skS \
  -b "$NOSCOPE_COOKIE_JAR" \
  -c "$NOSCOPE_COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$NOSCOPE_EMAIL\",\"password\":\"$NOSCOPE_PASSWORD\"}" >/dev/null

echo "[4/7] API node detail para operator e readonly escopados (200)"
OPERATOR_DETAIL="$(request_json "$OPERATOR_COOKIE_JAR" GET "/api/v1/nodes/$NODE_ID")"
[[ "$(json_get "$OPERATOR_DETAIL" "node.id")" == "$NODE_ID" ]]
READONLY_DETAIL="$(request_json "$READONLY_COOKIE_JAR" GET "/api/v1/nodes/$NODE_ID")"
[[ "$(json_get "$READONLY_DETAIL" "node.id")" == "$NODE_ID" ]]

echo "[5/7] Default-deny: ator sem escopo recebe 403 no node fora do escopo (C4)"
[[ "$(request_with_status "$NOSCOPE_COOKIE_JAR" GET "/api/v1/nodes/$NODE_ID")" == "403" ]]

echo "[6/7] Bootstrap admin bloqueado para operator/readonly"
[[ "$(request_with_status "$OPERATOR_COOKIE_JAR" GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command")" == "403" ]]
[[ "$(request_with_status "$READONLY_COOKIE_JAR" GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command")" == "403" ]]
[[ "$(request_with_status "$ADMIN_COOKIE_JAR" GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command")" == "200" ]]

echo "[7/7] Pagina web /nodes/:id para operator e readonly escopados"
OPERATOR_PAGE_HTTP="$(curl -skS -b "$OPERATOR_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/nodes/$NODE_ID")"
[[ "$OPERATOR_PAGE_HTTP" == "200" ]]
grep -q "RBAC ND Firewall $SUFFIX" "$RESPONSE_BODY_FILE"

READONLY_PAGE_HTTP="$(curl -skS -b "$READONLY_COOKIE_JAR" -o "$RESPONSE_BODY_FILE" -w '%{http_code}' "$BASE_URL/nodes/$NODE_ID")"
[[ "$READONLY_PAGE_HTTP" == "200" ]]
grep -q "RBAC ND Firewall $SUFFIX" "$RESPONSE_BODY_FILE"

echo "Smoke RBAC node detail OK: operator/readonly escopados leem node via API e pagina; ator sem escopo recebe 403 (default-deny C4); bootstrap segue restrito a admin."
