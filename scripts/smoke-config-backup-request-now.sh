#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

read_env_value() {
  local key="$1"
  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "${2:-$ROOT_DIR/.env.api}"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD)}"
COOKIE_JAR="$(mktemp)"
XML_FILE="$(mktemp)"
HB_FILE="$(mktemp)"
ACK_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$XML_FILE" "$HB_FILE" "$ACK_FILE"; }
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

build_hmac() {
  node -e '
const fs = require("fs");
const crypto = require("crypto");
const timestamp = process.argv[1];
const bodyPath = process.argv[2];
const secret = process.argv[3];
const body = bodyPath ? fs.readFileSync(bodyPath) : Buffer.alloc(0);
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n"), body]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$1" "${2:-}" "$3"
}

sha256_file() {
  node -e 'const fs=require("fs");const crypto=require("crypto");const b=fs.readFileSync(process.argv[1]);process.stdout.write(crypto.createHash("sha256").update(b).digest("hex"));' "$1"
}

SUFFIX="$(date +%s)"
NODE_UID="bk-req-$SUFFIX"
CLIENT_CODE="REQ-$SUFFIX"

cat > "$XML_FILE" <<XML
<?xml version="1.0"?><pfsense><request smoke="${SUFFIX}"/></pfsense>
XML

echo "[1/7] Login e provisionamento"
curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null
CLIENT_ID="$(json_get "$(request_json POST /api/v1/admin/clients "{\"name\":\"REQ $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")" "client.id")"
SITE_ID="$(json_get "$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"REQ Site\",\"code\":\"REQ-SITE-$SUFFIX\"}")" "site.id")"
NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

echo "[2/7] Solicitar backup agora"
REQUEST_RESPONSE="$(request_json POST "/api/v1/nodes/$NODE_ID/config-backups/request" '{}')"
COMMAND_ID="$(json_get "$REQUEST_RESPONSE" "command_id")"

echo "[3/7] Heartbeat deve retornar commands[]"
cat > "$HB_FILE" <<JSON
{
  "schema_version": "2026-01",
  "heartbeat_id": "hb-req-$SUFFIX",
  "sent_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node_uid": "$NODE_UID",
  "site_name": "REQ Site",
  "hostname": "$NODE_UID.local",
  "customer_code": "$CLIENT_CODE",
  "pfsense_version": "2.8.1",
  "uptime_sec": 1000,
  "services": [],
  "gateways": [],
  "notices": []
}
JSON
HB_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HB_SIG="$(build_hmac "$HB_TS" "$HB_FILE" "$NODE_SECRET")"
HB_RESPONSE="$(curl -skS \
  -H "content-type: application/json" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $HB_TS" \
  -H "x-signature: sha256=$HB_SIG" \
  --data-binary "@$HB_FILE" \
  "$BASE_URL/api/v1/ingest/heartbeat")"
HB_COMMAND_ID="$(json_get "$HB_RESPONSE" "commands.0.id")"
[[ "$HB_COMMAND_ID" == "$COMMAND_ID" ]]

echo "[4/7] command-ack picked_up"
cat > "$ACK_FILE" <<JSON
{"command_id":"$COMMAND_ID","status":"picked_up"}
JSON
ACK_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ACK_SIG="$(build_hmac "$ACK_TS" "$ACK_FILE" "$NODE_SECRET")"
ACK_RESPONSE="$(curl -skS \
  -H "content-type: application/json" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $ACK_TS" \
  -H "x-signature: sha256=$ACK_SIG" \
  --data-binary "@$ACK_FILE" \
  "$BASE_URL/api/v1/ingest/command-ack")"
[[ "$(json_get "$ACK_RESPONSE" "status")" == "picked_up" ]]

echo "[5/7] Upload com X-Command-Id"
CONFIG_SHA="$(sha256_file "$XML_FILE")"
CONFIG_SIZE="$(wc -c < "$XML_FILE" | tr -d ' ')"
UP_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
UP_SIG="$(build_hmac "$UP_TS" "$XML_FILE" "$NODE_SECRET")"
UPLOAD_RESPONSE="$(curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $UP_TS" \
  -H "x-signature: sha256=$UP_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
  -H "x-command-id: $COMMAND_ID" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$(json_get "$UPLOAD_RESPONSE" "stored")" == "true" ]]

echo "[6/7] Status do comando succeeded"
STATUS_RESPONSE="$(request_json GET "/api/v1/nodes/$NODE_ID/config-backups/requests/$COMMAND_ID")"
[[ "$(json_get "$STATUS_RESPONSE" "status")" == "succeeded" ]]

echo "[7/7] Duplicado com comando manual ainda succeeded"
DUP_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUP_SIG="$(build_hmac "$DUP_TS" "$XML_FILE" "$NODE_SECRET")"
curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $DUP_TS" \
  -H "x-signature: sha256=$DUP_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
  -H "x-command-id: $COMMAND_ID" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup" >/dev/null
REQUEST2="$(request_json POST "/api/v1/nodes/$NODE_ID/config-backups/request" '{}')"
COMMAND2="$(json_get "$REQUEST2" "command_id")"
ACK2_BODY="{\"command_id\":\"$COMMAND2\",\"status\":\"picked_up\"}"
ACK2_FILE="$(mktemp)"
echo "$ACK2_BODY" > "$ACK2_FILE"
ACK2_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ACK2_SIG="$(build_hmac "$ACK2_TS" "$ACK2_FILE" "$NODE_SECRET")"
curl -skS \
  -H "content-type: application/json" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $ACK2_TS" \
  -H "x-signature: sha256=$ACK2_SIG" \
  --data-binary "@$ACK2_FILE" \
  "$BASE_URL/api/v1/ingest/command-ack" >/dev/null
rm -f "$ACK2_FILE"
DUP2_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUP2_SIG="$(build_hmac "$DUP2_TS" "$XML_FILE" "$NODE_SECRET")"
DUP2_RESPONSE="$(curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $DUP2_TS" \
  -H "x-signature: sha256=$DUP2_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
  -H "x-command-id: $COMMAND2" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$(json_get "$DUP2_RESPONSE" "duplicate")" == "true" ]]
STATUS2="$(request_json GET "/api/v1/nodes/$NODE_ID/config-backups/requests/$COMMAND2")"
[[ "$(json_get "$STATUS2" "status")" == "succeeded" ]]

echo "smoke-config-backup-request-now OK"
