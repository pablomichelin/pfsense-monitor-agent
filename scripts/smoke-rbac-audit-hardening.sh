#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"
AUTH_EMAIL="${AUTH_BOOTSTRAP_EMAIL:-$(awk -F= '$1=="AUTH_BOOTSTRAP_EMAIL"{print $2}' .env.api)}"
AUTH_PASSWORD="${AUTH_BOOTSTRAP_PASSWORD:-$(awk -F= '$1=="AUTH_BOOTSTRAP_PASSWORD"{print $2}' .env.api)}"

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_BOOTSTRAP_EMAIL/PASSWORD ausentes em .env.api" >&2
  exit 1
fi

SUFFIX="$(date +%s)"
READONLY_EMAIL="audit-ro-$SUFFIX@test.local"
READONLY_PASSWORD="AuditRo!$SUFFIX"
CLIENT_CODE="AUDIT-$SUFFIX"

ADMIN_JAR="$(mktemp)"
READONLY_JAR="$(mktemp)"
TMP_BODY="$(mktemp)"
cleanup() {
  rm -f "$ADMIN_JAR" "$READONLY_JAR" "$TMP_BODY"
}
trap cleanup EXIT

json_get() {
  node -e '
const [path, raw] = process.argv.slice(1);
const payload = JSON.parse(raw);
const parts = path.split(".");
let current = payload;
for (const part of parts) {
  if (current == null) process.exit(2);
  current = current[part];
}
if (current == null || current === "") process.exit(2);
process.stdout.write(String(current));
' "$1" "$2"
}

csrf_token() {
  awk '$6=="monitor_pfsense_csrf"{print $7}' "$1"
}

echo "[1/5] Login superadmin e auditoria de login"
curl -skS -c "$ADMIN_JAR" -b "$ADMIN_JAR" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null

AUDIT_LOGIN="$(curl -skS -b "$ADMIN_JAR" "$BASE_URL/api/v1/admin/audit?action=auth.login&limit=5")"
LOGIN_ITEM="$(node -e '
const payload = JSON.parse(process.argv[1]);
const item = (payload.items ?? []).find((entry) => entry.action === "auth.login");
if (!item) process.exit(2);
process.stdout.write(JSON.stringify(item));
' "$AUDIT_LOGIN")"
[[ "$(json_get "actor_role" "$LOGIN_ITEM")" == "superadmin" ]]
[[ "$(json_get "result" "$LOGIN_ITEM")" == "success" ]]

echo "[2/5] Criando readonly e validando access.denied"
curl -skS -b "$ADMIN_JAR" -c "$ADMIN_JAR" -H "content-type: application/json" \
  -H "x-csrf-token: $(csrf_token "$ADMIN_JAR")" \
  -X POST "$BASE_URL/api/v1/admin/users" \
  --data "{\"email\":\"$READONLY_EMAIL\",\"password\":\"$READONLY_PASSWORD\",\"role\":\"readonly\"}" >/dev/null

CLIENT_RESPONSE="$(curl -skS -b "$ADMIN_JAR" -c "$ADMIN_JAR" -H "content-type: application/json" \
  -H "x-csrf-token: $(csrf_token "$ADMIN_JAR")" \
  -X POST "$BASE_URL/api/v1/admin/clients" \
  --data "{\"name\":\"Audit $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "client.id" "$CLIENT_RESPONSE")"

curl -skS -c "$READONLY_JAR" -b "$READONLY_JAR" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$READONLY_EMAIL\",\"password\":\"$READONLY_PASSWORD\"}" >/dev/null

STATUS="$(curl -skS -o "$TMP_BODY" -w '%{http_code}' -b "$READONLY_JAR" -c "$READONLY_JAR" \
  -H "x-csrf-token: $(csrf_token "$READONLY_JAR")" \
  -X DELETE "$BASE_URL/api/v1/admin/clients/$CLIENT_ID")"
[[ "$STATUS" == "403" ]]

AUDIT_DENIED="$(curl -skS -b "$ADMIN_JAR" "$BASE_URL/api/v1/admin/audit?action=access.denied&limit=10")"
DENIED_ITEM="$(node -e '
const payload = JSON.parse(process.argv[1]);
const item = (payload.items ?? []).find((entry) => entry.action === "access.denied");
if (!item) process.exit(2);
process.stdout.write(JSON.stringify(item));
' "$AUDIT_DENIED")"
[[ "$(json_get "actor_role" "$DENIED_ITEM")" == "readonly" ]]
[[ "$(json_get "result" "$DENIED_ITEM")" == "denied" ]]

echo "[3/5] Validando rate limit em package-release"
for _ in $(seq 1 61); do
  curl -skS -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/agent/package-release" >"$TMP_BODY"
done
[[ "$(cat "$TMP_BODY")" == "429" ]]

echo "[4/5] Validando permissions-matrix apos hardening"
MATRIX="$(curl -skS -b "$ADMIN_JAR" "$BASE_URL/api/v1/admin/permissions-matrix")"
json_get "permissions.0.id" "$MATRIX" >/dev/null

echo "[5/5] Regressao RBAC admin UX"
bash "$ROOT_DIR/scripts/smoke-rbac-admin-ux.sh"

echo "Smoke RBAC audit hardening OK: audit_logs padronizado, access.denied, rate limit e regressao."
