#!/usr/bin/env bash

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
XML_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$XML_FILE" "$BODY_FILE"; }
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

uuid_v4() {
  node -e 'process.stdout.write(require("crypto").randomUUID())'
}

SUFFIX="$(date +%s)"
CLIENT_CODE="BK-$SUFFIX"
SITE_CODE="BK-SITE-$SUFFIX"
NODE_UID="bk-fw-$SUFFIX"

cat > "$XML_FILE" <<XML
<?xml version="1.0"?>
<pfsense>
  <version>smoke-${SUFFIX}</version>
  <system>
    <hostname>bk-smoke-${SUFFIX}</hostname>
  </system>
</pfsense>
XML

echo "[1/8] Login"
curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null

echo "[2/8] Provisionando node de smoke"
CLIENT_ID="$(json_get "$(request_json POST /api/v1/admin/clients "{\"name\":\"Backup Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")" "client.id")"
SITE_ID="$(json_get "$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Backup Site $SUFFIX\",\"code\":\"$SITE_CODE\"}")" "site.id")"
NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

CONFIG_SHA="$(sha256_file "$XML_FILE")"
CONFIG_SIZE="$(wc -c < "$XML_FILE" | tr -d ' ')"
BACKUP_ID="$(uuid_v4)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIGNATURE="$(build_hmac "$TIMESTAMP" "$XML_FILE" "$NODE_SECRET")"

echo "[3/8] Upload valido"
UPLOAD_RESPONSE="$(curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$SIGNATURE" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $BACKUP_ID" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$(json_get "$UPLOAD_RESPONSE" "ok")" == "true" ]]
[[ "$(json_get "$UPLOAD_RESPONSE" "stored")" == "true" ]]
BACKUP_UID="$(json_get "$UPLOAD_RESPONSE" "backup_id")"

echo "[4/8] Assinatura invalida deve falhar"
BAD_SIG="$(build_hmac "$TIMESTAMP" "$XML_FILE" "wrong-secret-value")"
BAD_HTTP="$(curl -skS -o /dev/null -w '%{http_code}' \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$BAD_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(uuid_v4)" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$BAD_HTTP" == "401" ]]

echo "[5/8] Timestamp fora da janela deve falhar"
OLD_TS="2000-01-01T00:00:00Z"
OLD_SIG="$(build_hmac "$OLD_TS" "$XML_FILE" "$NODE_SECRET")"
OLD_HTTP="$(curl -skS -o /dev/null -w '%{http_code}' \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $OLD_TS" \
  -H "x-signature: sha256=$OLD_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(uuid_v4)" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$OLD_HTTP" == "401" ]]

echo "[6/8] Payload acima do limite deve falhar"
BIG_FILE="$(mktemp)"
python3 - <<PY > "$BIG_FILE"
print("A" * 6000000)
PY
BIG_SHA="$(sha256_file "$BIG_FILE")"
BIG_SIZE="$(wc -c < "$BIG_FILE" | tr -d ' ')"
BIG_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BIG_SIG="$(build_hmac "$BIG_TS" "$BIG_FILE" "$NODE_SECRET")"
BIG_HTTP="$(curl -skS -o /dev/null -w '%{http_code}' \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $BIG_TS" \
  -H "x-signature: sha256=$BIG_SIG" \
  -H "x-config-sha256: $BIG_SHA" \
  -H "x-config-size: $BIG_SIZE" \
  -H "x-backup-id: $(uuid_v4)" \
  --data-binary "@$BIG_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
rm -f "$BIG_FILE"
[[ "$BIG_HTTP" == "413" ]]

echo "[7/8] Listagem via API humana"
LIST_RESPONSE="$(request_json GET "/api/v1/nodes/$NODE_ID/config-backups")"
[[ "$(json_get "$LIST_RESPONSE" "summary.stored_count")" == "1" ]]

echo "[8/8] Duplicado nao cria novo stored"
DUP_ID="$(uuid_v4)"
DUP_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUP_SIG="$(build_hmac "$DUP_TS" "$XML_FILE" "$NODE_SECRET")"
DUP_RESPONSE="$(curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $DUP_TS" \
  -H "x-signature: sha256=$DUP_SIG" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $DUP_ID" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
[[ "$(json_get "$DUP_RESPONSE" "duplicate")" == "true" ]]
[[ "$(json_get "$DUP_RESPONSE" "stored")" == "false" ]]

echo "smoke-config-backup-api OK backup_uid=$BACKUP_UID"
