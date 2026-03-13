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
STREAM_OUT="$(mktemp)"
BODY_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="LAB-$SUFFIX"
NODE_UID="lab-fw-$SUFFIX"

cleanup() {
  rm -f "$COOKIE_JAR" "$STREAM_OUT" "$BODY_FILE"
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
  current = current?.[part];
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

  if [[ -n "$body" ]]; then
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
      -X "$method" \
      "$BASE_URL$path"
  fi
}

echo "[1/5] Login em $BASE_URL"
LOGIN_RESPONSE="$(curl -skS \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"

json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/5] Provisionando client/site/node temporarios"
CLIENT_RESPONSE="$(request_json POST /api/v1/admin/clients "{\"name\":\"SystemUp Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"

SITE_RESPONSE="$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Site Smoke $SUFFIX\",\"code\":\"SMOKE-$SUFFIX\",\"city\":\"Sao Paulo\",\"state\":\"SP\",\"timezone\":\"America/Sao_Paulo\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"

NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"Firewall Smoke $SUFFIX\",\"management_ip\":\"10.200.0.1\",\"wan_ip\":\"198.51.100.20\",\"pfsense_version\":\"2.8.1\",\"agent_version\":\"0.1.0\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

echo "[3/5] Abrindo stream SSE autenticado"
(timeout 8s curl -skN -b "$COOKIE_JAR" "$BASE_URL/api/realtime/dashboard" > "$STREAM_OUT") &
STREAM_PID=$!
sleep 1

echo "[4/5] Enviando heartbeat assinado para $NODE_UID"
cat > "$BODY_FILE" <<JSON
{
  "schema_version": "2026-01",
  "heartbeat_id": "hb-$SUFFIX",
  "sent_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node_uid": "$NODE_UID",
  "site_name": "Site Smoke $SUFFIX",
  "hostname": "$NODE_UID.local",
  "customer_code": "$CLIENT_CODE",
  "mgmt_ip": "10.200.0.1",
  "wan_ip_reported": "198.51.100.20",
  "pfsense_version": "2.8.1",
  "agent_version": "0.1.0",
  "uptime_sec": 86400,
  "cpu_percent": 10.5,
  "memory_percent": 42.1,
  "disk_percent": 58.4,
  "gateways": [
    { "name": "WAN_DHCP", "status": "online", "latency_ms": 18.1, "loss_percent": 0 }
  ],
  "services": [
    { "name": "unbound", "status": "running" },
    { "name": "openvpn", "status": "running" },
    { "name": "ipsec", "status": "running" }
  ],
  "notices": []
}
JSON

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIGNATURE="$(node -e '
const fs = require("fs");
const crypto = require("crypto");
const timestamp = process.argv[1];
const bodyPath = process.argv[2];
const secret = process.argv[3];
const body = fs.readFileSync(bodyPath);
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n"), body]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$TIMESTAMP" "$BODY_FILE" "$NODE_SECRET")"

HEARTBEAT_RESPONSE="$(curl -skS \
  -H "content-type: application/json" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$SIGNATURE" \
  --data-binary "@$BODY_FILE" \
  "$BASE_URL/api/v1/ingest/heartbeat")"

HEARTBEAT_STATUS="$(json_get "$HEARTBEAT_RESPONSE" "node_status")"
if [[ "$HEARTBEAT_STATUS" != "online" ]]; then
  echo "Heartbeat aceito, mas node_status retornou '$HEARTBEAT_STATUS'." >&2
  exit 1
fi

wait "$STREAM_PID" || true

echo "[5/5] Validando stream e leitura do inventario"
if ! grep -q "event: dashboard.refresh" "$STREAM_OUT"; then
  echo "Stream SSE nao publicou dashboard.refresh." >&2
  sed -n '1,120p' "$STREAM_OUT" >&2
  exit 1
fi

if ! grep -q "\"node_uid\":\"$NODE_UID\"" "$STREAM_OUT"; then
  echo "Stream SSE nao publicou o node_uid esperado." >&2
  sed -n '1,120p' "$STREAM_OUT" >&2
  exit 1
fi

NODES_RESPONSE="$(request_json GET "/api/v1/nodes?search=$NODE_UID")"
OBSERVED_STATUS="$(json_get "$NODES_RESPONSE" "items.0.effective_status")"
OBSERVED_ID="$(json_get "$NODES_RESPONSE" "items.0.id")"

if [[ "$OBSERVED_STATUS" != "online" || "$OBSERVED_ID" != "$NODE_ID" ]]; then
  echo "Inventario nao refletiu o node online apos o heartbeat." >&2
  echo "$NODES_RESPONSE" >&2
  exit 1
fi

echo "Smoke test OK: login, SSE autenticado, heartbeat assinado e refresh publicado para $NODE_UID."
