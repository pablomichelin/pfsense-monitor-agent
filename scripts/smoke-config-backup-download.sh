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
DOWNLOAD_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$XML_FILE" "$DOWNLOAD_FILE"; }
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
const body = fs.readFileSync(bodyPath);
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n"), body]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$1" "$2" "$3"
}

sha256_file() {
  node -e 'const fs=require("fs");const crypto=require("crypto");const b=fs.readFileSync(process.argv[1]);process.stdout.write(crypto.createHash("sha256").update(b).digest("hex"));' "$1"
}

SUFFIX="$(date +%s)"
NODE_UID="bk-dl-$SUFFIX"
cat > "$XML_FILE" <<XML
<?xml version="1.0"?><pfsense><download smoke="${SUFFIX}"/></pfsense>
XML

echo "[1/5] Login superadmin"
curl -skS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null

echo "[2/5] Criar node e enviar backup"
CLIENT_ID="$(json_get "$(request_json POST /api/v1/admin/clients "{\"name\":\"DL $SUFFIX\",\"code\":\"DL-$SUFFIX\"}")" "client.id")"
SITE_ID="$(json_get "$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"DL Site\",\"code\":\"DL-SITE-$SUFFIX\"}")" "site.id")"
NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET="$(json_get "$NODE_RESPONSE" "bootstrap.node_secret")"
CONFIG_SHA="$(sha256_file "$XML_FILE")"
CONFIG_SIZE="$(wc -c < "$XML_FILE" | tr -d ' ')"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIGNATURE="$(build_hmac "$TIMESTAMP" "$XML_FILE" "$NODE_SECRET")"
UPLOAD_RESPONSE="$(curl -skS \
  -H "content-type: application/xml" \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$SIGNATURE" \
  -H "x-config-sha256: $CONFIG_SHA" \
  -H "x-config-size: $CONFIG_SIZE" \
  -H "x-backup-id: $(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
  --data-binary "@$XML_FILE" \
  "$BASE_URL/api/v1/ingest/config-backup")"
BACKUP_UID="$(json_get "$UPLOAD_RESPONSE" "backup_id")"

echo "[3/5] Download superadmin"
curl -skS -b "$COOKIE_JAR" -o "$DOWNLOAD_FILE" "$BASE_URL/api/v1/nodes/$NODE_ID/config-backups/$BACKUP_UID/download"
cmp -s "$XML_FILE" "$DOWNLOAD_FILE"

echo "[4/5] Criar usuario admin e bloquear download"
ADMIN_EMAIL="bk-admin-$SUFFIX@smoke.local"
ADMIN_PASSWORD="SmokeAdmin-$SUFFIX"
request_json POST /api/v1/admin/users "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"role\":\"admin\",\"display_name\":\"BK Admin\"}" >/dev/null
ADMIN_JAR="$(mktemp)"
curl -skS -b "$ADMIN_JAR" -c "$ADMIN_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
ADMIN_HTTP="$(curl -skS -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/nodes/$NODE_ID/config-backups/$BACKUP_UID/download")"
[[ "$ADMIN_HTTP" == "403" ]]
rm -f "$ADMIN_JAR"

echo "[5/5] Auditoria de download"
AUDIT_RESPONSE="$(request_json GET "/api/v1/admin/audit?action=backup.config.download")"
echo "$AUDIT_RESPONSE" | grep -q 'backup.config.download'
echo "$AUDIT_RESPONSE" | grep -q "$NODE_ID"

echo "smoke-config-backup-download OK"
