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
CLIENT_CODE="UX-CLIENT-$SUFFIX"
CLIENT_USER_EMAIL="ux-client-$SUFFIX@test.local"
CLIENT_USER_PASSWORD="ClientUx!$SUFFIX"

ADMIN_COOKIE_JAR="$(mktemp)"
CLIENT_COOKIE_JAR="$(mktemp)"
TMP_BODY="$(mktemp)"
cleanup() {
  rm -f "$ADMIN_COOKIE_JAR" "$CLIENT_COOKIE_JAR" "$TMP_BODY"
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

request_redirect_location() {
  local cookie_jar="$1"
  local path="$2"
  curl -skS -D "$TMP_BODY" -o /dev/null -b "$cookie_jar" -c "$cookie_jar" "$BASE_URL$path"
  awk 'tolower($1) == "location:" { print $2 }' "$TMP_BODY" | tr -d '\r' | tail -n 1
}

echo "[1/5] Login superadmin"
LOGIN_RESPONSE="$(curl -skS -c "$ADMIN_COOKIE_JAR" -b "$ADMIN_COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "ok" "$LOGIN_RESPONSE" >/dev/null

echo "[2/5] Validando matriz de permissoes na API"
MATRIX_RESPONSE="$(curl -skS -b "$ADMIN_COOKIE_JAR" "$BASE_URL/api/v1/admin/permissions-matrix")"
json_get "roles.0" "$MATRIX_RESPONSE" >/dev/null
json_get "permissions.0.id" "$MATRIX_RESPONSE" >/dev/null

echo "[3/5] Criando usuario perfil client para teste de middleware"
CLIENT_CREATE_RESPONSE="$(curl -skS -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" -H "content-type: application/json" -H "x-csrf-token: $(awk '$6=="monitor_pfsense_csrf"{print $7}' "$ADMIN_COOKIE_JAR")" -X POST "$BASE_URL/api/v1/admin/clients" --data "{\"name\":\"UX Client $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "client.id" "$CLIENT_CREATE_RESPONSE")"
curl -skS -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" -H "content-type: application/json" -H "x-csrf-token: $(awk '$6=="monitor_pfsense_csrf"{print $7}' "$ADMIN_COOKIE_JAR")" -X POST "$BASE_URL/api/v1/admin/users" --data "{\"email\":\"$CLIENT_USER_EMAIL\",\"password\":\"$CLIENT_USER_PASSWORD\",\"role\":\"client\",\"client_id\":\"$CLIENT_ID\"}" >/dev/null

echo "[4/5] Login perfil client e bloqueio de rotas administrativas"
curl -skS -c "$CLIENT_COOKIE_JAR" -b "$CLIENT_COOKIE_JAR" -H "content-type: application/json" -X POST "$BASE_URL/api/v1/auth/login" --data "{\"email\":\"$CLIENT_USER_EMAIL\",\"password\":\"$CLIENT_USER_PASSWORD\"}" >/dev/null

for blocked_path in /admin /admin/usuarios /admin/permissoes /audit /bootstrap /alerts; do
  location="$(request_redirect_location "$CLIENT_COOKIE_JAR" "$blocked_path")"
  if [[ -z "$location" || "$location" != *"/conta"* || "$location" != *"access=denied"* ]]; then
    echo "Redirect de $blocked_path nao apontou para /conta?access=denied (location=$location)" >&2
    exit 1
  fi
done

echo "[5/5] Superadmin acessa pagina de permissoes"
curl -skS -o "$TMP_BODY" -b "$ADMIN_COOKIE_JAR" "$BASE_URL/admin/permissoes"
grep -q 'Matriz de permissões' "$TMP_BODY"

echo "Smoke RBAC admin UX OK: middleware bloqueia rotas administrativas para perfil client e matriz de permissoes acessivel."
