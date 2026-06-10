#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"
RETENTION_COUNT="${RETENTION_COUNT:-$(read_env_value CONFIG_BACKUP_RETENTION_COUNT 2>/dev/null || true)}"
RETENTION_COUNT="${RETENTION_COUNT:-30}"

read_env_value() {
  local key="$1"
  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "${2:-$ROOT_DIR/.env.api}"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD)}"
COOKIE_JAR="$(mktemp)"
XML_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$XML_FILE"; }
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
process.stdout.write(String(current));
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
  curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" "${csrf_header[@]}" -X "$method" "$BASE_URL$path" ${body:+--data "$body"}
}

build_hmac() {
  node -e '
const fs = require("fs");
const crypto = require("crypto");
const timestamp = process.argv[1];
const bodyPath = process.argv[2];
const secret = process.argv[3];
const body = fs.readFileSync(bodyPath);
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n"), body]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$1" "$2" "$3"
}

sha256_file() {
  node -e 'const fs=require("fs");const crypto=require("crypto");const b=fs.readFileSync(process.argv[1]);process.stdout.write(crypto.createHash("sha256").update(b).digest("hex"));' "$1"
}

upload_backup() {
  local index="$1"
  cat > "$XML_FILE" <<XML
<?xml version="1.0"?><pfsense><retention index="${index}" ts="$(date +%s%N)"/></pfsense>
XML
  local config_sha config_size timestamp signature
  config_sha="$(sha256_file "$XML_FILE")"
  config_size="$(wc -c < "$XML_FILE" | tr -d ' ')"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  signature="$(build_hmac "$timestamp" "$XML_FILE" "$NODE_SECRET")"
  curl -skS \
    -H "content-type: application/xml" \
    -H "x-node-uid: $NODE_UID" \
    -H "x-timestamp: $timestamp" \
    -H "x-signature: sha256=$signature" \
    -H "x-config-sha256: $config_sha" \
    -H "x-config-size: $config_size" \
    -H "x-backup-id: $(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
    --data-binary "@$XML_FILE" \
    "$BASE_URL/api/v1/ingest/config-backup" >/dev/null
  sleep 1
}

SUFFIX="$(date +%s)"
NODE_UID="bk-ret-$SUFFIX"

echo "[1/4] Login e provisionamento"
curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null
CLIENT_ID="$(json_get "$(request_json POST /api/v1/admin/clients "{\"name\":\"RET $SUFFIX\",\"code\":\"RET-$SUFFIX\"}")" "client.id")"
SITE_ID="$(json_get "$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"RET Site\",\"code\":\"RET-SITE-$SUFFIX\"}")" "site.id")"
NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"

UPLOAD_TOTAL=$((RETENTION_COUNT + 2))
echo "[2/4] Enviando $UPLOAD_TOTAL backups distintos (retention_count=$RETENTION_COUNT)"
for i in $(seq 1 "$UPLOAD_TOTAL"); do
  upload_backup "$i"
done

echo "[3/4] Validando retencao (esperado stored_count <= $RETENTION_COUNT)"
LIST_RESPONSE="$(request_json GET "/api/v1/nodes/$NODE_ID/config-backups")"
STORED_COUNT="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(String(p.summary.stored_count));' "$LIST_RESPONSE")"
if [[ "$STORED_COUNT" -gt "$RETENTION_COUNT" ]]; then
  echo "stored_count=$STORED_COUNT excedeu retention_count=$RETENTION_COUNT" >&2
  exit 1
fi

echo "[4/4] Ultimo backup permanece stored"
LATEST_STATUS="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(p.items[0]?.status||"");' "$LIST_RESPONSE")"
[[ "$LATEST_STATUS" == "stored" ]]

echo "smoke-config-backup-retention OK stored_count=$STORED_COUNT"
